//! MCP server for Sequill: lets AI assistants list, read and (when allowed) change
//! the databases the desktop app manages. The app runs the tools (`host`); `sequill mcp`
//! relays an assistant's calls to it (`relay`) over a local pipe (`pipe`).

pub mod cli;
pub mod host;
pub mod pipe;
pub mod relay;
pub mod server;
pub mod tools;
