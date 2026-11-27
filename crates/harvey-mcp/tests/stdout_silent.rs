//! stdout is the MCP protocol channel (FR-161): the binary must not print anything to it.

use std::process::{Command, Stdio};

#[test]
fn main_writes_nothing_to_stdout() {
    let output = Command::new(env!("CARGO_BIN_EXE_harvey-mcp"))
        .stdin(Stdio::null())
        .output()
        .expect("failed to run harvey-mcp");
    assert!(output.status.success());
    assert!(output.stdout.is_empty());
}
