//! The local connection between `sequill mcp` and the running app: a named pipe on Windows,
//! a Unix socket elsewhere. Its address comes from the data folder, so each folder has its
//! own app. Only the app opens database files; `sequill mcp` never touches the data folder,
//! which matters on Windows, where a packaged MCP client (such as Claude Desktop) would
//! otherwise make it work on a private copy of `%APPDATA%`.

use std::io;
use std::path::Path;

/// One end of a connection, in the app (`Listener::accept`) or in `sequill mcp` (`connect`).
pub trait Stream: tokio::io::AsyncRead + tokio::io::AsyncWrite + Send + Unpin + 'static {}
impl<T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Send + Unpin + 'static> Stream for T {}

#[cfg(windows)]
pub use windows::{Listener, address, connect};

#[cfg(unix)]
pub use unix::{Listener, address, connect};

/// Whether `connect` failed because no app is listening (closed, or still starting).
pub fn app_not_running(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::NotFound | io::ErrorKind::ConnectionRefused
    )
}

#[cfg(windows)]
mod windows {
    use super::*;
    use std::time::Duration;
    use tokio::net::windows::named_pipe::{
        ClientOptions, NamedPipeClient, NamedPipeServer, ServerOptions,
    };

    /// All of the pipe's instances are taken; another frees up as soon as the app accepts.
    const ERROR_PIPE_BUSY: i32 = 231;
    const BUSY_WAIT: Duration = Duration::from_millis(50);
    const BUSY_TRIES: u32 = 100;

    /// FNV-1a: stable across builds and platforms, unlike `DefaultHasher`.
    fn fnv1a(bytes: &[u8]) -> u64 {
        bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x0100_0000_01b3)
        })
    }

    /// `\\.\pipe\sequill-mcp-<hash of the folder>`. Pipe names are shared by every user of
    /// the machine; the folder (in the user's profile) keeps them apart. Windows paths
    /// ignore case, so the name does too.
    pub fn address(data_dir: &Path) -> String {
        let folder = data_dir.to_string_lossy().to_lowercase();
        format!(r"\\.\pipe\sequill-mcp-{:016x}", fnv1a(folder.as_bytes()))
    }

    fn instance(name: &str, first: bool) -> io::Result<NamedPipeServer> {
        // The default security lets only this user (and administrators) send requests.
        ServerOptions::new()
            .first_pipe_instance(first)
            .reject_remote_clients(true)
            .create(name)
    }

    /// The app's end: accepts `sequill mcp` connections, one per assistant session.
    pub struct Listener {
        name: String,
        next: NamedPipeServer,
    }

    impl Listener {
        /// Fails if another app already serves this folder.
        pub fn bind(data_dir: &Path) -> io::Result<Self> {
            let name = address(data_dir);
            let next = instance(&name, true)?;
            Ok(Self { name, next })
        }

        pub async fn accept(&mut self) -> io::Result<NamedPipeServer> {
            self.next.connect().await?;
            let fresh = instance(&self.name, false)?;
            Ok(std::mem::replace(&mut self.next, fresh))
        }
    }

    /// `sequill mcp`'s end. See `app_not_running` for the error when the app is closed.
    pub async fn connect(data_dir: &Path) -> io::Result<NamedPipeClient> {
        let name = address(data_dir);
        let mut tries = 0;
        loop {
            match ClientOptions::new().open(&name) {
                Err(error) if error.raw_os_error() == Some(ERROR_PIPE_BUSY) => {
                    tries += 1;
                    if tries == BUSY_TRIES {
                        return Err(error);
                    }
                    tokio::time::sleep(BUSY_WAIT).await;
                }
                opened => return opened,
            }
        }
    }
}

#[cfg(unix)]
mod unix {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;
    use tokio::net::{UnixListener, UnixStream};

    const SOCKET_FILE: &str = "mcp.sock";

    pub fn address(data_dir: &Path) -> PathBuf {
        data_dir.join(SOCKET_FILE)
    }

    /// The app's end: accepts `sequill mcp` connections, one per assistant session.
    pub struct Listener {
        path: PathBuf,
        inner: UnixListener,
    }

    impl Listener {
        /// Fails if another app already serves this folder. A socket left by an app that
        /// crashed is replaced.
        pub fn bind(data_dir: &Path) -> io::Result<Self> {
            let path = address(data_dir);
            if path.exists() {
                if std::os::unix::net::UnixStream::connect(&path).is_ok() {
                    return Err(io::Error::new(
                        io::ErrorKind::AddrInUse,
                        "another Sequill is already serving assistants",
                    ));
                }
                fs::remove_file(&path)?;
            }
            let inner = UnixListener::bind(&path)?;
            // Only this user may connect.
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
            Ok(Self { path, inner })
        }

        pub async fn accept(&mut self) -> io::Result<UnixStream> {
            self.inner.accept().await.map(|(stream, _)| stream)
        }
    }

    impl Drop for Listener {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.path);
        }
    }

    /// `sequill mcp`'s end. See `app_not_running` for the error when the app is closed.
    pub async fn connect(data_dir: &Path) -> io::Result<UnixStream> {
        UnixStream::connect(address(data_dir)).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[tokio::test]
    async fn the_app_end_and_the_relay_end_talk() {
        let dir = tempfile::tempdir().unwrap();
        let mut listener = Listener::bind(dir.path()).unwrap();
        let accepted = tokio::spawn(async move {
            let mut stream = listener.accept().await.unwrap();
            let mut buf = [0; 4];
            stream.read_exact(&mut buf).await.unwrap();
            stream.write_all(b"pong").await.unwrap();
            buf
        });
        let mut client = connect(dir.path()).await.unwrap();
        client.write_all(b"ping").await.unwrap();
        let mut reply = [0; 4];
        client.read_exact(&mut reply).await.unwrap();
        assert_eq!(&reply, b"pong");
        assert_eq!(&accepted.await.unwrap(), b"ping");
    }

    #[tokio::test]
    async fn a_closed_app_is_reported_as_not_running() {
        let dir = tempfile::tempdir().unwrap();
        let error = connect(dir.path()).await.unwrap_err();
        assert!(app_not_running(&error), "{error:?}");
    }

    #[tokio::test]
    async fn only_one_app_serves_a_folder() {
        let dir = tempfile::tempdir().unwrap();
        let _first = Listener::bind(dir.path()).unwrap();
        assert!(Listener::bind(dir.path()).is_err());
    }

    #[test]
    fn each_folder_has_its_own_address() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        assert_ne!(address(a.path()), address(b.path()));
        assert_eq!(address(a.path()), address(a.path()));
    }
}
