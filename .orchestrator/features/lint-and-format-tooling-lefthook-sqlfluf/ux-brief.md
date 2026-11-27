# UX brief — Lint and format tooling (#20)

No end-user interface: no design task, `ui` and `ux` nodes are not used.

The "users" are developers and agents committing to the repo. Their experience rules:

- A hook either fixes the file silently (and re-stages it) or blocks with the tool's own message naming the file,
  the line and the rule. No hook prints noise when it has nothing to do.
- Every failure says how to fix it: a missing tool → the exact install command from `docs/dev-setup.md`; a
  `deps-exact` violation → the offending spec and what is expected (see `api-contract.md`).
- pre-commit works only on staged files and stays fast (seconds); full runs belong to pre-push and CI.
- The commands in `docs/dev-setup.md` are copy-pasteable and are exactly the ones CI runs.
