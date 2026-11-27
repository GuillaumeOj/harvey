# Architecture Decision Records

An ADR records one architectural decision for Harvey: what was decided, why
it was decided, which alternatives were rejected, and the evidence behind
it. One decision per file.

Write an ADR for any decision that a later issue relies on, and for every M0
spike. Start from [`000-template.md`](000-template.md).

## File naming

- Files are named `NNN-kebab-title.md`, where `NNN` is a 3-digit number
  (`001`, `002`, …).
- A number is never reused, even for a Rejected ADR.
- `000-template.md` is the template, not an ADR.

## Statuses

- `Proposed`: under discussion, not yet relied on.
- `Accepted`: the decision in force.
- `Superseded by ADR-xxx`: replaced by a later ADR, linked from the status
  line.
- `Rejected`: considered and turned down; the file stays for the record.

## Rules

- An Accepted ADR is immutable, except for its status line (and, when it is
  superseded, a "Superseded by" link). A change of decision is a new ADR
  that supersedes the old one.
- An ADR must not contradict [`docs/SPEC.md`](../SPEC.md). If an ADR
  changes a decision of the spec, the same PR updates the spec.
- No secrets and no real Apple Team ID. Use the `$(TeamID)` placeholder or
  the `HARVEY_TEAM_ID` variable, resolved by the release pipeline.
- No personal data from the developer's Mac (names, paths, calendars,
  contacts, screenshots of real data).

## Index

Each ADR PR adds or updates its row.

<!-- markdownlint-disable MD013 -->

| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [ADR-001](001-process-sandbox-entitlements.md) | Process, sandbox and entitlement model | Accepted | 2026-11-27 |

<!-- markdownlint-enable MD013 -->

## Reserved numbers

These numbers are reserved for the M0 spikes so that parallel PRs do not
collide. "Reserved" is not a status: a spike PR moves its row from this
table to the index.

| ADR | Topic | Issue |
| --- | --- | --- |
| ADR-002 | EventKit actor | #25 |
| ADR-003 | WidgetKit + UniFFI + App Group | #26 |
| ADR-004 | MCP App Group access and `.mcpb` path | #27 |
| ADR-005 | macOS end-to-end tests | #28 |
| ADR-006 | BlockNote in WKWebView | #29 |
| ADR-007 | Backup encryption | #30 |

The next free number for an unreserved ADR is **008**.
