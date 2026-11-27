#!/usr/bin/env bun
// deps-exact: fail on any dependency, toolchain or CI action that is not pinned exactly.
// Contract: .orchestrator/features/lint-and-format-tooling-lefthook-sqlfluf/api-contract.md
// No network, no third-party dependency (Bun.TOML, node:fs).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

export interface Violation {
  /** Repo-relative path, always with `/` separators. */
  file: string;
  /** Dotted key path, package URL, `uses` value, ... */
  location: string;
  /** The offending spec as written. */
  spec: string;
  reason: string;
}

/** A file could not be read or parsed (exit code 2). */
export class FileError extends Error {}

const SEMVER = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
const EXACT_SEMVER = new RegExp(`^${SEMVER}$`);
const CARGO_EXACT = new RegExp(`^=\\s*${SEMVER}$`);
const BUN_PACKAGE_MANAGER = new RegExp(`^bun@${SEMVER}$`);
const NPM_ALIAS = new RegExp(`^npm:(?:@[^/@]+/)?[^/@]+@${SEMVER}$`);
const RUST_CHANNEL = /^1\.\d+\.\d+$/;
const NIGHTLY = /^nightly-\d{4}-\d{2}-\d{2}$/;
const ACTION_SHA = /^[\w.-]+\/[\w.-]+(?:\/[^@\s]+)?@[0-9a-f]{40}$/;
const DOCKER_DIGEST = /^docker:\/\/\S+@sha256:[0-9a-f]{64}$/;
const PEP440_EXACT = String.raw`\d+(?:\.\d+)*(?:(?:a|b|rc)\d+)?(?:\.post\d+)?(?:\.dev\d+)?(?:\+[\w.]+)?`;
const PIP_PIN = new RegExp(String.raw`^[A-Za-z0-9][A-Za-z0-9._-]*(?:\[[^\]]*\])?==${PEP440_EXACT}(?:\s*;.*)?$`);

const SKIP_DIRS = new Set(["node_modules", "target", ".git", ".venv", ".build", ".claude", ".orchestrator"]);
const SKIP_PATHS = ["scripts/fixtures"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function parseToml(file: string, text: string): Record<string, unknown> {
  try {
    return Bun.TOML.parse(text) as Record<string, unknown>;
  } catch (error) {
    throw new FileError(`${file}: invalid TOML (${(error as Error).message})`);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// package.json
// ---------------------------------------------------------------------------------------------------------------------

const NPM_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

function npmReason(spec: string): string {
  if (/^(git\+|git:|github:|gitlab:|bitbucket:|[\w.-]+\/[\w.-]+(#.*)?$)/.test(spec))
    return "git dependency; use an exact version x.y.z";
  if (/^https?:/.test(spec)) return "tarball URL; use an exact version x.y.z";
  if (/^(file|link|portal):/.test(spec)) return "local path; use an exact version x.y.z (or workspace:*)";
  if (/^workspace:/.test(spec)) return "use workspace:*";
  if (/^[A-Za-z][\w.-]*$/.test(spec) || spec === "") return "dist-tag or missing version; use an exact version x.y.z";
  return "range; use an exact version x.y.z";
}

export function checkPackageJson(file: string, text: string, isRoot = false): Violation[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new FileError(`${file}: invalid JSON (${(error as Error).message})`);
  }
  if (!isObject(json)) throw new FileError(`${file}: package.json must be an object`);

  const violations: Violation[] = [];
  for (const section of NPM_SECTIONS) {
    const deps = json[section];
    if (deps === undefined) continue;
    if (!isObject(deps)) {
      violations.push({ file, location: section, spec: describe(deps), reason: "must be an object" });
      continue;
    }
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== "string") {
        violations.push({ file, location: `${section}.${name}`, spec: describe(spec), reason: "must be a string" });
      } else if (spec !== "workspace:*" && !EXACT_SEMVER.test(spec) && !NPM_ALIAS.test(spec)) {
        violations.push({ file, location: `${section}.${name}`, spec, reason: npmReason(spec) });
      }
    }
  }

  const pm = json.packageManager;
  if (pm === undefined) {
    if (isRoot) {
      violations.push({ file, location: "packageManager", spec: "(missing)", reason: 'set "bun@x.y.z"' });
    }
  } else if (typeof pm !== "string" || !BUN_PACKAGE_MANAGER.test(pm)) {
    violations.push({ file, location: "packageManager", spec: describe(pm), reason: 'must be "bun@x.y.z"' });
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------------------------------
// Cargo.toml
// ---------------------------------------------------------------------------------------------------------------------

const CARGO_DEP_TABLES = [
  "dependencies",
  "dev-dependencies",
  "build-dependencies",
  "dev_dependencies",
  "build_dependencies",
];
const CARGO_GIT_KEYS = ["git", "registry", "branch", "tag", "rev"];

function tomlKey(key: string): string {
  return /^[\w-]+$/.test(key) ? key : `'${key}'`;
}

function checkCargoDep(file: string, location: string, dep: unknown): Violation | undefined {
  if (typeof dep === "string") {
    return CARGO_EXACT.test(dep) ? undefined : { file, location, spec: dep, reason: 'use "=x.y.z"' };
  }
  if (!isObject(dep)) return { file, location, spec: describe(dep), reason: "unsupported dependency form" };

  for (const key of CARGO_GIT_KEYS) {
    if (key in dep) {
      return {
        file,
        location,
        spec: `${key} = ${describe(dep[key])}`,
        reason: `\`${key}\` is not allowed; use a registry version "=x.y.z"`,
      };
    }
  }
  if (dep.workspace === true) return undefined;
  const version = dep.version;
  if (version === undefined) {
    return "path" in dep ? undefined : { file, location, spec: "(no version)", reason: 'add version = "=x.y.z"' };
  }
  if (typeof version !== "string" || !CARGO_EXACT.test(version)) {
    return { file, location, spec: describe(version), reason: 'use "=x.y.z"' };
  }
  return undefined;
}

function checkCargoTables(file: string, prefix: string, tables: Record<string, unknown>): Violation[] {
  const violations: Violation[] = [];
  for (const table of CARGO_DEP_TABLES) {
    const deps = tables[table];
    if (!isObject(deps)) continue;
    for (const [name, dep] of Object.entries(deps)) {
      const violation = checkCargoDep(file, `${prefix}${table}.${tomlKey(name)}`, dep);
      if (violation) violations.push(violation);
    }
  }
  return violations;
}

export function checkCargoToml(file: string, text: string): Violation[] {
  const toml = parseToml(file, text);
  const violations = checkCargoTables(file, "", toml);

  const workspace = toml.workspace;
  if (isObject(workspace) && isObject(workspace.dependencies)) {
    for (const [name, dep] of Object.entries(workspace.dependencies)) {
      const violation = checkCargoDep(file, `workspace.dependencies.${tomlKey(name)}`, dep);
      if (violation) violations.push(violation);
    }
  }

  const target = toml.target;
  if (isObject(target)) {
    for (const [cfg, tables] of Object.entries(target)) {
      if (isObject(tables)) violations.push(...checkCargoTables(file, `target.'${cfg}'.`, tables));
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------------------------------
// Package.swift
// ---------------------------------------------------------------------------------------------------------------------

/** Replace comments with spaces and string contents with `_`, keeping offsets identical. */
function maskSwift(source: string): { code: string; masked: string } {
  let code = "";
  let masked = "";
  let i = 0;
  const push = (original: string, mask: string) => {
    code += original;
    masked += mask;
  };
  while (i < source.length) {
    const ch = source[i] as string;
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        push(" ", " ");
        i++;
      }
    } else if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (; i < stop; i++) {
        const keep = source[i] === "\n" ? "\n" : " ";
        push(keep, keep);
      }
    } else if (ch === '"') {
      push(ch, ch);
      i++;
      while (i < source.length && source[i] !== '"' && source[i] !== "\n") {
        const escaped = source[i] === "\\";
        push(source[i] as string, "_");
        i++;
        if (escaped && i < source.length) {
          push(source[i] as string, "_");
          i++;
        }
      }
      if (i < source.length && source[i] === '"') {
        push('"', '"');
        i++;
      }
    } else {
      push(ch, ch);
      i++;
    }
  }
  return { code, masked };
}

export function checkPackageSwift(file: string, text: string): Violation[] {
  const { code, masked } = maskSwift(text);
  const violations: Violation[] = [];

  for (const match of masked.matchAll(/\.package\s*\(/g)) {
    const open = match.index + match[0].length;
    let depth = 1;
    let close = open;
    while (close < masked.length && depth > 0) {
      const ch = masked[close];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      close++;
    }
    const args = code.slice(open, close - 1);
    const maskedArgs = masked.slice(open, close - 1);
    if (/\bpath\s*:/.test(maskedArgs)) continue; // local package

    const source = /\b(?:url|id)\s*:\s*"([^"]*)"/.exec(args);
    const location = source?.[1] ?? args.trim().replace(/\s+/g, " ");
    const spec = args
      .replace(source?.[0] ?? "", "")
      .replace(/^[\s,]+|[\s,]+$/g, "")
      .replace(/\s+/g, " ");

    const exact = /\bexact\s*:\s*"([^"]*)"|\.exact\s*\(\s*"([^"]*)"\s*\)/.exec(args);
    let reason: string | undefined;
    if (/\.upToNext(?:Major|Minor)\b/.test(maskedArgs)) reason = "range; use exact:";
    else if (/\bfrom\s*:/.test(maskedArgs)) reason = "`from:` is a range; use exact:";
    else if (/\.\.[.<]/.test(maskedArgs)) reason = "range; use exact:";
    else if (/\bbranch\s*:|\.branch\s*\(/.test(maskedArgs)) reason = "branch is not allowed; use exact:";
    else if (/\brevision\s*:|\.revision\s*\(/.test(maskedArgs)) reason = "revision is not allowed; use exact:";
    else if (!exact) reason = 'use exact: "x.y.z"';
    else if (!EXACT_SEMVER.test((exact[1] ?? exact[2]) as string)) reason = 'exact: must be a full "x.y.z" version';
    if (reason) violations.push({ file, location, spec: spec || "(no requirement)", reason });
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------------------------------
// GitHub workflows and composite actions
// ---------------------------------------------------------------------------------------------------------------------

export function checkWorkflow(file: string, text: string): Violation[] {
  const violations: Violation[] = [];
  for (const line of text.split(/\r?\n/)) {
    // Block form (`uses: x` / `- uses: x`) or flow form (`- { name: n, uses: x }`).
    const match = /^\s*(?:-\s+)?uses\s*:\s*(.*)$/.exec(line) ?? /[{,]\s*uses\s*:\s*([^,}]*)/.exec(line);
    if (!match) continue;
    const value = (match[1] as string)
      .replace(/\s+#.*$/, "")
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (value === "" || value.startsWith("./") || value.startsWith("../")) continue;
    if (value.startsWith("docker://")) {
      if (!DOCKER_DIGEST.test(value)) {
        violations.push({ file, location: `uses ${value}`, spec: value, reason: "pin the image to a sha256 digest" });
      }
    } else if (!ACTION_SHA.test(value)) {
      violations.push({ file, location: `uses ${value}`, spec: value, reason: "pin to a 40-hex commit SHA" });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------------------------------
// Toolchains and bun config
// ---------------------------------------------------------------------------------------------------------------------

export function checkBunfig(file: string, text: string): Violation[] {
  const install = parseToml(file, text).install;
  if (isObject(install) && install.exact === true) return [];
  const spec = isObject(install) && "exact" in install ? describe(install.exact) : "(missing)";
  return [{ file, location: "install.exact", spec, reason: "set [install] exact = true" }];
}

export function checkRustToolchain(file: string, text: string): Violation[] {
  const toolchain = parseToml(file, text).toolchain;
  const channel = isObject(toolchain) ? toolchain.channel : undefined;
  if (typeof channel === "string" && RUST_CHANNEL.test(channel)) return [];
  return [
    {
      file,
      location: "toolchain.channel",
      spec: channel === undefined ? "(missing)" : describe(channel),
      reason: 'use a full version "1.x.y"',
    },
  ];
}

export function checkRustfmtNightly(file: string, text: string): Violation[] {
  const value = text.trim();
  if (NIGHTLY.test(value)) return [];
  return [{ file, location: "toolchain", spec: value || "(empty)", reason: "use nightly-YYYY-MM-DD" }];
}

// ---------------------------------------------------------------------------------------------------------------------
// requirements*.txt / requirements*.in
// ---------------------------------------------------------------------------------------------------------------------

export function checkRequirements(file: string, text: string): Violation[] {
  const violations: Violation[] = [];
  // Join `\` continuation lines (pip-compile --generate-hashes puts `--hash=` on the following lines).
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const startLine = i + 1;
    let logical = lines[i] as string;
    // Comment lines are never continued (pip does the same), so a trailing `\` there must not swallow the next entry.
    while (!/^\s*#/.test(logical) && logical.trimEnd().endsWith("\\") && i + 1 < lines.length) {
      logical = `${logical.trimEnd().slice(0, -1)} ${lines[++i]}`;
    }
    const entry = logical
      .replace(/(^|\s)#.*$/, "")
      .replace(/(\s+--hash=\S+)+\s*$/, "")
      .trim();
    if (
      entry === "" ||
      /^(-[rcif]|--(?:requirement|constraint|index-url|extra-index-url|find-links|trusted-host|no-index|no-binary|only-binary|require-hashes|prefer-binary|pre))(?:[\s=]|$)/.test(
        entry,
      )
    )
      continue;
    if (!PIP_PIN.test(entry)) {
      violations.push({ file, location: `line ${startLine}`, spec: entry, reason: "use name==x.y.z" });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------------------------------
// Repo scan
// ---------------------------------------------------------------------------------------------------------------------

type Checker = (file: string, text: string) => Violation[];

function checkerFor(rel: string): Checker | undefined {
  const name = basename(rel);
  if (name === "package.json") return (file, text) => checkPackageJson(file, text, rel === name);
  if (name === "Cargo.toml") return checkCargoToml;
  if (name === "Package.swift") return checkPackageSwift;
  if (name === "bunfig.toml") return checkBunfig;
  if (name === "rust-toolchain.toml") return checkRustToolchain;
  if (name === "rustfmt-nightly.toolchain") return checkRustfmtNightly;
  if (/^requirements.*\.(txt|in)$/.test(name)) return checkRequirements;
  if (/\.ya?ml$/.test(name) && (/^\.github\/workflows\/[^/]+$/.test(rel) || rel.startsWith(".github/actions/"))) {
    return checkWorkflow;
  }
  return undefined;
}

function* walk(root: string, dir = root): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(root, full).split(sep).join("/");
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_PATHS.some((path) => rel === path || rel.endsWith(`/${path}`))) continue;
      yield* walk(root, full);
    } else if (entry.isFile()) {
      yield rel;
    }
  }
}

export function checkRepo(root: string): { filesChecked: number; violations: Violation[] } {
  const violations: Violation[] = [];
  let filesChecked = 0;
  for (const rel of walk(root)) {
    const checker = checkerFor(rel);
    if (!checker) continue;
    filesChecked++;
    violations.push(...checker(rel, readFileSync(join(root, rel), "utf8")));
  }
  violations.sort(
    (a, b) =>
      a.file.localeCompare(b.file, "en") ||
      a.location.localeCompare(b.location, "en") ||
      a.spec.localeCompare(b.spec, "en"),
  );
  return { filesChecked, violations };
}

// ---------------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------------

function defaultRoot(): string {
  const scriptDir = dirname(import.meta.path);
  try {
    const git = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd: scriptDir, stderr: "ignore" });
    const top = git.success ? git.stdout.toString().trim() : "";
    if (top) return top;
  } catch {
    // git is not installed: fall back to the script's parent directory.
  }
  return dirname(scriptDir);
}

function parseArgs(argv: string[]): { root?: string; json: boolean } {
  let root: string | undefined;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--json") json = true;
    else if (arg === "--root") {
      root = argv[++i];
      if (root === undefined) throw new FileError("--root requires a directory");
    } else if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
      if (root === "") throw new FileError("--root requires a directory");
    } else throw new FileError(`unknown argument: ${arg} (usage: deps-exact.ts [--root DIR] [--json])`);
  }
  return { root, json };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function main(argv: string[]): number {
  try {
    const args = parseArgs(argv);
    const root = resolve(args.root ?? defaultRoot());
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new FileError(`not a directory: ${root}`);

    const { filesChecked, violations } = checkRepo(root);
    const ok = violations.length === 0;
    if (args.json) {
      console.log(JSON.stringify({ ok, filesChecked, violations }, null, 2));
    } else if (ok) {
      console.log(`deps-exact: OK (${plural(filesChecked, "file")} checked)`);
    } else {
      for (const v of violations) {
        const spec = v.location.startsWith("uses ") ? "" : ` → ${JSON.stringify(v.spec)}`;
        console.error(`${v.file}: ${v.location}${spec} (${v.reason})`);
      }
      const files = new Set(violations.map((v) => v.file)).size;
      console.error(`deps-exact: ${plural(violations.length, "violation")} in ${plural(files, "file")}`);
    }
    return ok ? 0 : 1;
  } catch (error) {
    const message = (error as Error).message;
    if (argv.includes("--json")) console.log(JSON.stringify({ ok: false, error: message }));
    console.error(`deps-exact: ${message}`);
    return 2;
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
