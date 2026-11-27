# ADR-001: Process, sandbox and entitlement model

- Status: Accepted
- Date: 2026-11-27
- Spec refs: §4.3, §6.1, §6.5, §6.6, §6.7, §6.8, §6.9, §13 step 3, FR-61,
  FR-151, §14 M0
- Related issues: #24, #4, #25, #26, #27, #116

## Context

Harvey ships three binaries that share one SQLite database in the App Group
container: `Harvey.app` (Tauri), the WidgetKit extension (`.appex`) and
`harvey-mcp` (the stdio server launched by Claude Desktop). They are
launched by different parties and run under different macOS rules.

EventKit access, file bookmarks, backups, migrations and code signing all
depend on which process may do what. Every later issue that touches one of
them relies on this decision, so it is recorded first.

## Decision

The process, sandbox and entitlement model is the one of spec §6.8:

<!-- markdownlint-disable MD013 -->

| Binary | Launched by | Sandboxed | Entitlements | May |
| --- | --- | --- | --- | --- |
| `Harvey.app` | User / login item | **No** (Developer ID, hardened runtime) | App Group; calendars; reminders (Info.plist usage strings) | Everything; only process using EventKit, bookmarks, Keychain backup key, migrations, backup/restore |
| Widget `.appex` | WidgetKit | **Yes** (required for extensions) | App sandbox, App Group | Timer operations through `harvey-ffi` only |
| `harvey-mcp` | Claude Desktop | **No** | App Group only (team-prefixed) | DB access through `harvey-core` with `McpPolicyService` checks; no EventKit, no bookmarks, no backups |

<!-- markdownlint-enable MD013 -->

### App Group

The App Group ID is team-prefixed, so no provisioning profile is needed:

- Production: `<TeamID>.com.harvey`
- Development: `<TeamID>.com.harvey.dev` (development builds use
  the same paths under this group and never touch production data)

The live database is:

<!-- markdownlint-disable MD013 -->

```text
~/Library/Group Containers/<TeamID>.com.harvey/Harvey/harvey.sqlite
```

<!-- markdownlint-enable MD013 -->

`HARVEY_DATA_DIR` overrides this path for development and tests.

### Entitlement files

Each binary is signed with its own entitlement file, in
[`scripts/release/entitlements/`](../../scripts/release/entitlements/):

<!-- markdownlint-disable MD013 -->

| Binary | Production | Development |
| --- | --- | --- |
| `Harvey.app` | [`harvey-app.entitlements`](../../scripts/release/entitlements/harvey-app.entitlements) | [`harvey-app.dev.entitlements`](../../scripts/release/entitlements/harvey-app.dev.entitlements) |
| `harvey-mcp` | [`harvey-mcp.entitlements`](../../scripts/release/entitlements/harvey-mcp.entitlements) | [`harvey-mcp.dev.entitlements`](../../scripts/release/entitlements/harvey-mcp.dev.entitlements) |
| Widget `.appex` | [`widget.entitlements`](../../scripts/release/entitlements/widget.entitlements) | [`widget.dev.entitlements`](../../scripts/release/entitlements/widget.dev.entitlements) |

<!-- markdownlint-enable MD013 -->

- `Harvey.app`: `com.apple.security.application-groups` and
  `com.apple.security.personal-information.calendars`. Reminders are
  assumed covered by the calendars key plus the
  `NSRemindersFullAccessUsageDescription` usage string (§6.6), pending #25.
- `harvey-mcp`: `com.apple.security.application-groups` only.
- Widget: `com.apple.security.app-sandbox` and
  `com.apple.security.application-groups`.

The files use the `$(TeamID)` placeholder; the release pipeline (#116)
replaces it with the value of `HARVEY_TEAM_ID`. No real Team ID is stored
in the repository.

### Signing order

Sign inside-out, each item with its own entitlement file (§13 step 3):

1. Frameworks and dylibs.
2. `harvey-mcp`.
3. Widget `.appex` (sandbox + App Group).
4. `Harvey.app` (App Group, calendars; hardened runtime).

Never use `codesign --deep`. Every Mach-O is signed with the hardened
runtime.

## Consequences (positive / negative / follow-ups)

### Positive

- `Harvey.app` is not sandboxed, so file bookmarks are regular bookmarks,
  created without the security-scope option (§6.8 calls them app-scoped);
  no security-scoped access is started.
- Writing to the backup folder is a plain filesystem write by the
  non-sandboxed app. iCloud Drive access may prompt once; onboarding
  handles it.
- EventKit runs in one process only, which owns the single TCC permission
  and the prompt UI (§4.3, §6.6).
- Migrations and restore run only in `Harvey.app`, under the maintenance
  lock (§6.9); the MCP server and the widget never change the schema.
- The MCP server and the widget have the smallest possible surface: no
  EventKit, no bookmarks, no backups.

### Negative

- Bookmarks are resolved by the app only; the MCP server and the widget
  never resolve them (FR-61).
- Bookmarks do not survive a restore on another Mac: the user relinks the
  files.
- EventKit is only in the app, so MCP calendar writes are queued, approved
  in Harvey and pushed by the running app (§4.3). This is why Harvey
  registers as a login item and keeps running in the menu bar (FR-151).
- Three entitlement files (and three dev variants) must stay in step with
  this ADR and with the signing order.

### Follow-ups

- #116: the release pipeline consumes the entitlement files and signs in
  the order above.
- #25, #26 and #27 resolve the open questions below. A spike that changes
  this decision does so with a new ADR that supersedes this one.

## Alternatives considered

- **Sandboxing the main app.** Rejected: every file link and the backup
  folder would need security-scoped bookmarks, and integration with iCloud
  Drive and Claude Desktop would be harder.
- **EventKit in `harvey-mcp`.** Rejected: the TCC prompt would be
  attributed to Claude Desktop as the responsible process, which confuses
  the permission, and `harvey-mcp` has no UI to approve it.
- **EventKit in the widget.** Rejected: the extension runs only briefly
  under WidgetKit, cannot show the permission prompt, and would need its
  own calendars entitlement and TCC grant on top of the app's.

## Evidence (spike results, measurements, links to prototype code)

- The decision is taken in the spec (§6.8, marked ADR-001); this ADR
  records it.
- No spike was run for it. Later spikes (#25, #26, #27) may supersede it.

## Open questions

- Can `harvey-mcp`, launched by Claude Desktop, access the App Group
  container on macOS 15 and later? → #27
- What is the widget memory and size budget, and how is the container path
  resolved inside the sandbox? → #26
- What are the exact EventKit entitlement keys under the hardened runtime,
  including whether reminders need more than the calendars key and the
  usage string? → #25
