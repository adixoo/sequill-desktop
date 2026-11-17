import { describe, expect, test } from "bun:test";
import {
  assertSemver,
  readWorkspaceVersion,
  setLocalLockVersions,
  setWorkspaceVersion,
} from "./cargo-version";

const CARGO_TOML = `[workspace]
members = ["crates/a"]

[workspace.package]
version = "0.2.2"
edition = "2024"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
`;

const CARGO_LOCK = `version = 4

[[package]]
name = "sequill-core"
version = "0.2.2"
dependencies = [
 "serde",
]

[[package]]
name = "serde"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "sequill-desktop"
version = "0.2.2"
`;

describe("setWorkspaceVersion", () => {
  test("changes only [workspace.package]'s version", () => {
    const next = setWorkspaceVersion(CARGO_TOML, "0.3.0");
    expect(readWorkspaceVersion(next)).toBe("0.3.0");
    expect(next).toContain('serde = { version = "1"');
    expect(next).toBe(CARGO_TOML.replace('version = "0.2.2"', 'version = "0.3.0"'));
  });

  test("keeps pre-release versions from Changesets' pre mode", () => {
    expect(readWorkspaceVersion(setWorkspaceVersion(CARGO_TOML, "1.0.0-beta.1"))).toBe(
      "1.0.0-beta.1",
    );
  });

  test("rejects a manifest without a workspace version", () => {
    const noVersion = CARGO_TOML.replace('version = "0.2.2"\n', "");
    expect(() => setWorkspaceVersion(noVersion, "0.3.0")).toThrow("no version");
    expect(() => readWorkspaceVersion('[package]\nversion = "1.0.0"\n')).toThrow("no version");
  });
});

describe("setLocalLockVersions", () => {
  test("bumps workspace crates and leaves registry crates alone", () => {
    const next = setLocalLockVersions(CARGO_LOCK, "0.3.0");
    expect(next).toContain('name = "sequill-core"\nversion = "0.3.0"');
    expect(next).toContain('name = "sequill-desktop"\nversion = "0.3.0"');
    expect(next).toContain('name = "serde"\nversion = "1.0.0"');
    expect(next.startsWith("version = 4\n")).toBe(true);
  });

  test("returns the same text when already at the version", () => {
    expect(setLocalLockVersions(CARGO_LOCK, "0.2.2")).toBe(CARGO_LOCK);
  });

  test("rejects a lockfile with no workspace crates", () => {
    expect(() => setLocalLockVersions("version = 4\n", "0.3.0")).toThrow("no workspace crates");
  });
});

describe("assertSemver", () => {
  test("accepts full versions and rejects partial or empty ones", () => {
    expect(() => assertSemver("1.2.3")).not.toThrow();
    expect(() => assertSemver("1.2.3-rc.1+build.5")).not.toThrow();
    for (const bad of ["", "1.2", "v1.2.3", "1.2.3 "]) {
      expect(() => assertSemver(bad)).toThrow("not a semver");
    }
  });
});
