/**
 * The real desktop app under Playwright, without WebDriver: the debug build is started with
 * its WebView2 listening for the Chrome DevTools Protocol, and Playwright attaches to it.
 * Each test gets a fresh data folder and WebView2 profile, so the user's own databases and
 * settings are never touched. Windows only (WebView2); build first with
 * `bun run desktop:build:debug`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { chromium, test as base, expect, type Browser, type Page } from "@playwright/test";

export const APP_EXE = resolve("target/debug/sequill.exe");

export interface DesktopApp {
  /** The app's window. */
  page: Page;
  /** The data folder this app (and `sequill mcp` started by `mcp()`) uses. */
  dataDir: string;
  /** Quits the app, as closing its window would. */
  close(): Promise<void>;
}

interface Fixtures {
  dataDir: string;
  /** Starts the app on `dataDir`; call it again after `close()` to restart. */
  launch(): Promise<DesktopApp>;
  /** An assistant's connection: `sequill mcp` on the same data folder, over stdio. */
  mcp(): Promise<McpClient>;
}

let nextPort = 9400;
const TEMP_PREFIX = "sequill-e2e-";

/**
 * WebView2's helper processes keep its profile files open for a few seconds after the app
 * exits, so a folder that can't be removed now is removed by a later run instead.
 */
function removeTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
  } catch {
    // Left for the sweep below.
  }
}

for (const name of readdirSync(tmpdir())) {
  if (name.startsWith(TEMP_PREFIX)) removeTempDir(join(tmpdir(), name));
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  dataDir: async ({}, provide) => {
    const dir = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
    await provide(dir);
    removeTempDir(dir);
  },
  launch: async ({ dataDir }, provide, info) => {
    test.skip(
      process.platform !== "win32",
      "Playwright reaches the app through WebView2 (Windows)",
    );
    test.skip(!existsSync(APP_EXE), "Build the app first: bun run desktop:build:debug");
    const open: DesktopApp[] = [];
    await provide(async () => {
      const app = await launchApp(dataDir, nextPort++ + info.workerIndex * 100);
      open.push(app);
      return app;
    });
    for (const app of open) await app.close();
  },
  mcp: async ({ dataDir }, provide) => {
    const clients: McpClient[] = [];
    await provide(async () => {
      const client = await McpClient.start(dataDir);
      clients.push(client);
      return client;
    });
    await Promise.all(clients.map((client) => client.close()));
  },
});
export { expect };

async function launchApp(dataDir: string, port: number): Promise<DesktopApp> {
  const child = spawn(APP_EXE, [], {
    env: {
      ...process.env,
      SEQUILL_DATA_DIR: dataDir,
      WEBVIEW2_USER_DATA_FOLDER: join(dataDir, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: "ignore",
  });
  const browser = await connect(port, child);
  const page = await appPage(browser);
  let closed = false;
  return {
    page,
    dataDir,
    async close() {
      if (closed) return;
      closed = true;
      await browser.close().catch(() => undefined);
      await quit(child);
    },
  };
}

async function connect(port: number, child: ChildProcess): Promise<Browser> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`The app exited with code ${child.exitCode}`);
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

/** The window's page once the app has loaded into it. */
async function appPage(browser: Browser): Promise<Page> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => /tauri/.test(p.url()));
    if (page) return page;
    if (Date.now() > deadline) throw new Error("The app's window never loaded");
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Closes the window the way a person would (so WebView2 saves its storage), forcing it only if needed. */
async function quit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise((r) => child.once("exit", r));
  spawn("taskkill", ["/PID", String(child.pid)], { stdio: "ignore" });
  const timeout = new Promise((r) => setTimeout(() => r("timeout"), 15_000));
  if ((await Promise.race([exited, timeout])) === "timeout") {
    // /T also ends the app's WebView2 processes.
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    await exited;
  }
}

/** A minimal MCP client over `sequill mcp`'s stdio: initialize, then tool calls. */
export class McpClient {
  private nextId = 1;
  private waiting = new Map<number, (message: Record<string, unknown>) => void>();

  private constructor(private child: ChildProcess) {
    createInterface({ input: child.stdout! }).on("line", (line) => {
      const message = JSON.parse(line) as Record<string, unknown>;
      const id = message.id as number | undefined;
      if (id !== undefined) this.waiting.get(id)?.(message);
    });
  }

  static async start(dataDir: string): Promise<McpClient> {
    const child = spawn(APP_EXE, ["mcp"], {
      env: { ...process.env, SEQUILL_DATA_DIR: dataDir },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const client = new McpClient(child);
    await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "e2e", version: "0" },
    });
    client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    return client;
  }

  private send(message: object): void {
    this.child.stdin!.write(`${JSON.stringify(message)}\n`);
  }

  private request(method: string, params: object): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise((done) => {
      this.waiting.set(id, done);
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  /** Calls a tool; resolves with its text, or rejects with it when the tool reports an error. */
  async call(name: string, args: object = {}): Promise<string> {
    const reply = await this.request("tools/call", { name, arguments: args });
    if (reply.error) throw new Error(JSON.stringify(reply.error));
    const result = reply.result as { content: { text: string }[]; isError?: boolean };
    const text = result.content.map((c) => c.text).join("\n");
    if (result.isError) throw new Error(text);
    return text;
  }

  /** Ends the session, like an assistant quitting; resolves once the process is gone. */
  async close(): Promise<void> {
    if (this.child.exitCode !== null) return;
    const exited = new Promise((r) => this.child.once("exit", r));
    this.child.stdin!.end();
    this.child.kill();
    await exited;
  }
}
