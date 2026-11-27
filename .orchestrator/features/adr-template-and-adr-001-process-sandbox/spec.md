# Spec — ADR template and ADR-001: process, sandbox and entitlement model

Issue: #24 (parent epic #4, milestone M0). Docs and config only: no Rust,
UI, Swift or design work. No `ux-brief.md` / `api-contract.md` (no design,
no frontend/backend contract).

## Goal

Set up the ADR format for the repo and record the first, already-taken
decision (spec §6.8): which binaries exist, who launches them, which are
sandboxed, which entitlements each has, what each may do. Ship draft
entitlement files that the release pipeline (#116) will consume.

## Deliverables

### 1. `docs/adr/README.md`

- What an ADR is in Harvey (one decision per file, why it was taken,
  alternatives, evidence); when to write one (any decision that a later
  issue relies on, every M0 spike).
- File naming: `NNN-kebab-title.md`, 3-digit number, never reused, even
  for a Rejected ADR. `000-template.md` is the template, not an ADR.
- Statuses: `Proposed`, `Accepted`, `Superseded by ADR-xxx`, `Rejected`.
- Rules (from #24): an Accepted ADR is immutable except its status line
  (and, when superseded, a "Superseded by" link); a change of decision is a
  new ADR that supersedes the old one. An ADR must not contradict
  `docs/SPEC.md`: if it changes a spec decision, the same PR updates the
  spec. No secrets and no real Team ID: use `$(TeamID)` /
  `HARVEY_TEAM_ID`. No personal data from the developer's Mac (epic #4).
- **Index** table: number (linked), title, status, date. One row now:
  ADR-001, Accepted, 2026-11-27. Each ADR PR adds/updates its row.
- **Reserved numbers** table (separate from the index, since "Reserved" is
  not a status): ADR-002 EventKit actor (#25), ADR-003 WidgetKit + UniFFI +
  App Group (#26), ADR-004 MCP App Group access and `.mcpb` path (#27),
  ADR-005 macOS e2e (#28), ADR-006 BlockNote in WKWebView (#29), ADR-007
  backup encryption (#30). A spike PR moves its row from Reserved to the
  index. Next free number for unreserved ADRs: 008.

### 2. `docs/adr/000-template.md`

Exactly the headings from #24 (title line `# ADR-NNN: <title>`, the four
metadata bullets Status / Date / Spec refs / Related issues, then Context,
Decision, Consequences (positive / negative / follow-ups), Alternatives
considered, Evidence, Open questions), each with a one-line guidance
comment saying what goes there.

### 3. `docs/adr/001-process-sandbox-entitlements.md` — Accepted, 2026-11-27

Contents, all from #24 and spec §4.3, §6.1, §6.5–§6.9, §13, FR-61, FR-151:

- **Context**: three binaries share one SQLite DB in the App Group
  container; EventKit, bookmarks, backups and signing issues depend on who
  may do what.
- **Decision**: the §6.8 table verbatim (Harvey.app / widget `.appex` /
  `harvey-mcp`); App Group IDs prod `<TeamID>.com.fusily.harvey`, dev
  `<TeamID>.com.fusily.harvey.dev` (team-prefixed, no provisioning
  profile); live DB path
  `~/Library/Group Containers/<TeamID>.com.fusily.harvey/Harvey/harvey.sqlite`
  (`HARVEY_DATA_DIR` override for dev/tests); per-binary entitlement files
  (links to `scripts/release/entitlements/`); signing order inside-out:
  frameworks/dylibs → `harvey-mcp` → widget `.appex` → `Harvey.app`, never
  `--deep`, hardened runtime on every Mach-O.
- **Consequences**: positive / negative / follow-ups covering: bookmarks
  are app-scoped and resolved by the app only (MCP and widget never), and
  do not survive a restore on another Mac → relink; backup-folder write is
  a plain filesystem write by the non-sandboxed app (iCloud Drive may
  prompt once, onboarding handles it); EventKit only in the app, so MCP
  calendar writes are queued and pushed by the running app (§4.3), hence
  the login item (FR-151); migrations and restore only by the app (§6.9).
  Follow-ups: #116 consumes the entitlement files; #25/#26/#27 resolve the
  open questions.
- **Alternatives considered** (rejected, with why): sandboxing the main
  app; EventKit in `harvey-mcp`; EventKit in the widget.
- **Evidence**: spec §6.8 decision; no spike (decision taken in the spec);
  later spikes may supersede.
- **Open questions** handed to spikes: App Group container access by
  `harvey-mcp` launched by Claude Desktop on macOS 15+ (#27); widget
  memory/size budget and sandbox path resolution (#26); exact EventKit
  entitlement keys under hardened runtime, incl. whether reminders need
  more than the calendars key + usage string (#25).

### 4. Entitlement drafts in `scripts/release/entitlements/`

Six XML property lists (`plutil -lint` clean), each starting with an XML
comment that points to `docs/adr/001-process-sandbox-entitlements.md`,
names the binary, and states that `$(TeamID)` is a placeholder replaced by
the release pipeline (#116) from `HARVEY_TEAM_ID` — never a real value.

| File | Keys |
|---|---|
| `harvey-app.entitlements` | `com.apple.security.application-groups` = [`$(TeamID).com.fusily.harvey`]; `com.apple.security.personal-information.calendars` = true |
| `harvey-mcp.entitlements` | `com.apple.security.application-groups` = [`$(TeamID).com.fusily.harvey`] only |
| `widget.entitlements` | `com.apple.security.app-sandbox` = true; `com.apple.security.application-groups` = [`$(TeamID).com.fusily.harvey`] |
| `harvey-app.dev.entitlements` | as app, group `$(TeamID).com.fusily.harvey.dev` |
| `harvey-mcp.dev.entitlements` | as MCP, `.dev` group |
| `widget.dev.entitlements` | as widget, `.dev` group |

No reminders-specific key is added: the header comment of the app files
notes that reminders are assumed covered by the calendars key + the
`NSRemindersFullAccessUsageDescription` usage string, pending #25. No
sandbox key on the app or MCP files. No other keys (no network, no
JIT/unsigned-memory exceptions).

## Out of scope

- Spike ADRs 002–007 (#25–#30); the signing pipeline and expectations file
  (#116); CODEOWNERS (#22); markdownlint config file (#20); any change to
  `docs/SPEC.md` (ADR-001 restates it, it does not change it).

## Acceptance / verification

- Files above exist; ADR-001 is Accepted and contains the table, both App
  Group IDs, consequences, alternatives, signing order and open questions.
- `markdownlint-cli2 "docs/adr/**/*.md"` passes with **default rules** (no
  config file in repo yet): prose wrapped at 80 columns; long tables and
  paths wrapped in `<!-- markdownlint-disable MD013 -->` …
  `<!-- markdownlint-enable MD013 -->` so the files also pass under #20's
  future config.
- `plutil -lint scripts/release/entitlements/*.entitlements` passes.
- Nothing in the new files contradicts `docs/SPEC.md`.

## Tasks (after approval)

1. `back` — write all four deliverables, run both linters, report output.
   Single task: the docs cross-reference each other and are small.
