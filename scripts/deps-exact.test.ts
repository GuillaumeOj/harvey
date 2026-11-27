import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkCargoToml, checkPackageSwift, checkRepo, checkRequirements, type Violation } from "./deps-exact.ts";

const SCRIPT = resolve(import.meta.dir, "deps-exact.ts");
const FIXTURES = resolve(import.meta.dir, "fixtures/deps-exact");
const fixture = (name: string) => join(FIXTURES, name);

/** `file: location` pairs, to assert exactly which entries are rejected. */
function found(name: string): string[] {
  return checkRepo(fixture(name)).violations.map((v) => `${v.file}: ${v.location}`);
}

function cli(args: string[]) {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args]);
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

describe("accepted forms", () => {
  test("valid mini repo has no violation", () => {
    const { filesChecked, violations } = checkRepo(fixture("valid"));
    expect(violations).toEqual([]);
    // 2 package.json, 2 Cargo.toml, Package.swift, bunfig, rust-toolchain, rustfmt-nightly,
    // 3 requirements files, 2 workflow/action files
    expect(filesChecked).toBe(13);
  });

  test("skips node_modules, target, .git, .venv, .build and scripts/fixtures", () => {
    const root = mkdtempSync(join(tmpdir(), "deps-exact-skip-"));
    try {
      for (const dir of [
        "node_modules/x",
        "target/x",
        ".git/x",
        ".venv/x",
        ".build/x",
        "scripts/fixtures/x",
        "a/node_modules/y",
      ]) {
        mkdirSync(join(root, dir), { recursive: true });
        writeFileSync(join(root, dir, "package.json"), '{ "dependencies": { "bad": "^1.0.0" } }');
      }
      expect(checkRepo(root)).toEqual({ filesChecked: 0, violations: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("package.json", () => {
  const violations = checkRepo(fixture("bad-package-json")).violations;
  const byLocation = new Map(violations.map((v) => [v.location, v]));

  test.each([
    ["dependencies.caret", "^1.2.3"],
    ["dependencies.tilde", "~1.2.3"],
    ["dependencies.gt", ">1.0.0"],
    ["dependencies.lt", "<2.0.0"],
    ["dependencies.star", "*"],
    ["dependencies.x", "1.x"],
    ["dependencies.or", "1.0.0 || 2.0.0"],
    ["dependencies.hyphen", "1.0.0 - 2.0.0"],
    ["dependencies.tag", "latest"],
    ["dependencies.partial", "1.2"],
    ["dependencies.empty", ""],
    ["devDependencies.gitplus", "git+https://github.com/a/b.git"],
    ["devDependencies.gh", "github:a/b"],
    ["devDependencies.tarball", "https://example.com/x.tgz"],
    ["devDependencies.file", "file:../x"],
    ["devDependencies.link", "link:../x"],
    ["devDependencies.ws", "workspace:^"],
    ["devDependencies.num", "1"],
    ["optionalDependencies.opt", "^1.0.0"],
    ["peerDependencies.peer", ">=1.0.0"],
    ["packageManager", "npm@10.0.0"],
  ])("rejects %s", (location, spec) => {
    expect(byLocation.get(location)?.spec).toBe(spec);
  });

  test("rejects nothing else", () => {
    expect(violations).toHaveLength(21);
  });

  test("root package.json must declare packageManager", () => {
    expect(found("bad-package-json-root-pm")).toEqual(["package.json: packageManager"]);
  });

  test("packageManager must be a full bun@x.y.z", () => {
    expect(found("bad-package-json-pm")).toEqual(["package.json: packageManager"]);
  });
});

describe("Cargo.toml", () => {
  test("rejects every non-exact form", () => {
    expect(found("bad-cargo")).toEqual([
      "Cargo.toml: build-dependencies.builddep",
      "Cargo.toml: dependencies.bare",
      "Cargo.toml: dependencies.dotted",
      "Cargo.toml: dev-dependencies.devdep",
      "Cargo.toml: target.'cfg(unix)'.dependencies.libc",
      "Cargo.toml: target.'cfg(windows)'.build-dependencies.winres",
      "Cargo.toml: workspace.dependencies.branch",
      "Cargo.toml: workspace.dependencies.caret",
      "Cargo.toml: workspace.dependencies.gitdep",
      "Cargo.toml: workspace.dependencies.nopatch",
      "Cargo.toml: workspace.dependencies.noversion",
      "Cargo.toml: workspace.dependencies.range",
      "Cargo.toml: workspace.dependencies.reg",
      "Cargo.toml: workspace.dependencies.tablerange",
    ]);
  });

  test("reports the offending spec", () => {
    const specs = new Map(checkRepo(fixture("bad-cargo")).violations.map((v) => [v.location, v.spec]));
    expect(specs.get("workspace.dependencies.range")).toBe("1.0");
    expect(specs.get("workspace.dependencies.nopatch")).toBe("=1.2");
    expect(specs.get("workspace.dependencies.tablerange")).toBe("1.2");
    expect(specs.get("workspace.dependencies.gitdep")).toBe("git = https://github.com/a/b");
    expect(specs.get("workspace.dependencies.noversion")).toBe("(no version)");
  });

  test("unparseable TOML is an error", () => {
    expect(() => checkRepo(fixture("bad-cargo-invalid"))).toThrow(/Cargo\.toml: invalid TOML/);
  });
});

describe("Package.swift", () => {
  test("accepts exact: and local paths only", () => {
    const violations = checkRepo(fixture("bad-swift")).violations;
    expect(violations.map((v) => v.location)).toEqual([
      "https://example.com/branch.git",
      "https://example.com/closed.git",
      "https://example.com/from.git",
      "https://example.com/major.git",
      "https://example.com/minor.git",
      "https://example.com/multi.git",
      "https://example.com/none.git",
      "https://example.com/partial.git",
      "https://example.com/range.git",
      "https://example.com/revision.git",
    ]);
    expect(violations.find((v) => v.location.endsWith("/from.git"))?.spec).toBe('from: "1.0.0"');
  });
});

describe("GitHub workflows and actions", () => {
  test("rejects every unpinned external uses", () => {
    expect(found("bad-workflow")).toEqual([
      ".github/actions/nested/deep/action.yaml: uses actions/cache@v4",
      ".github/workflows/ci.yml: uses actions/cache@08c6903",
      ".github/workflows/ci.yml: uses actions/cache@08c6903cd8c0fde910a37f88322edcfb5dd907a8c",
      ".github/workflows/ci.yml: uses actions/checkout@v4",
      ".github/workflows/ci.yml: uses actions/setup-node@main",
      ".github/workflows/ci.yml: uses docker://alpine:3.20",
      ".github/workflows/ci.yml: uses owner/repo",
      ".github/workflows/ci.yml: uses owner/repo/.github/workflows/x.yml@main",
      ".github/workflows/ci.yml: uses quoted/action@v1",
    ]);
  });
});

describe("bunfig.toml and toolchains", () => {
  test("bunfig exact = false", () => {
    expect(found("bad-bunfig")).toEqual(["bunfig.toml: install.exact"]);
  });
  test("bunfig without exact", () => {
    expect(found("bad-bunfig-missing")).toEqual(["bunfig.toml: install.exact"]);
  });
  test("rust-toolchain channel stable", () => {
    expect(found("bad-rust-toolchain")).toEqual(["rust-toolchain.toml: toolchain.channel"]);
  });
  test("rust-toolchain channel without patch", () => {
    expect(found("bad-rust-toolchain-short")).toEqual(["rust-toolchain.toml: toolchain.channel"]);
  });
  test("rustfmt-nightly.toolchain must be dated", () => {
    expect(found("bad-rustfmt-nightly")).toEqual(["rustfmt-nightly.toolchain: toolchain"]);
  });
});

describe("requirements*.txt / *.in", () => {
  test("rejects unpinned lines, accepts hashes, comments and -r", () => {
    const violations = checkRepo(fixture("bad-requirements")).violations;
    expect(violations.map((v) => `${v.file}:${v.location}`)).toEqual([
      "requirements-dev.txt:line 1",
      "requirements-dev.txt:line 2",
      "requirements-dev.txt:line 3",
      "requirements-dev.txt:line 4",
      "requirements-dev.txt:line 5",
      "requirements-dev.txt:line 7",
      "requirements.in:line 2",
    ]);
    expect(violations[0]?.spec).toBe("sqlfluff>=3.0");
  });
});

describe("review fixes", () => {
  test("accepts PEP 440 exact pins and pip option lines", () => {
    const text =
      "--index-url https://pypi.org/simple\ntzdata==2024.2\nfoo==1.0.0.post1\nbaz==1.0.0rc1\n--only-binary=:all:\n";
    expect(checkRequirements("requirements.txt", text)).toEqual([]);
    expect(checkRequirements("requirements.txt", "foo==1.*\n")).toHaveLength(1);
  });

  test("accepts .exact() and underscore Cargo tables, rejects them when unpinned", () => {
    expect(checkPackageSwift("Package.swift", '.package(url: "u", .exact("1.2.3"))')).toEqual([]);
    expect(checkCargoToml("Cargo.toml", '[dev_dependencies]\nx = "1"\n')).toHaveLength(1);
  });

  test("skips nested worktrees and nested fixtures", () => {
    const root = mkdtempSync(join(tmpdir(), "deps-exact-nested-"));
    try {
      for (const dir of [".claude/worktrees/x", "a/scripts/fixtures/y"]) {
        mkdirSync(join(root, dir), { recursive: true });
        writeFileSync(join(root, dir, "package.json"), '{ "dependencies": { "bad": "^1.0.0" } }');
      }
      expect(checkRepo(root).violations).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--json reports usage errors on stdout too", () => {
    const { code, stdout } = cli(["--json", "--root", join(FIXTURES, "does-not-exist")]);
    expect(code).toBe(2);
    expect(JSON.parse(stdout).ok).toBe(false);
  });
});

describe("CLI", () => {
  test("exit 0 and one-line summary on success", () => {
    const { code, stdout, stderr } = cli(["--root", fixture("valid")]);
    expect(code).toBe(0);
    expect(stdout).toBe("deps-exact: OK (13 files checked)\n");
    expect(stderr).toBe("");
  });

  test("exit 1 with one line per violation and a summary on stderr", () => {
    const { code, stdout, stderr } = cli(["--root", fixture("bad-workflow")]);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    const lines = stderr.trimEnd().split("\n");
    expect(lines[0]).toBe(
      ".github/actions/nested/deep/action.yaml: uses actions/cache@v4 (pin to a 40-hex commit SHA)",
    );
    expect(lines.at(-1)).toBe("deps-exact: 9 violations in 2 files");
  });

  test("dependency violations show location → spec (reason)", () => {
    const { stderr } = cli(["--root", fixture("bad-package-json-pm")]);
    expect(stderr).toBe(
      'package.json: packageManager → "bun@1.4" (must be "bun@x.y.z")\ndeps-exact: 1 violation in 1 file\n',
    );
  });

  test("--json prints the report on stdout and keeps the exit code", () => {
    const ok = cli(["--root", fixture("valid"), "--json"]);
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout)).toEqual({ ok: true, filesChecked: 13, violations: [] });

    const bad = cli(["--json", "--root", fixture("bad-bunfig")]);
    expect(bad.code).toBe(1);
    const report = JSON.parse(bad.stdout) as { ok: boolean; filesChecked: number; violations: Violation[] };
    expect(report.ok).toBe(false);
    expect(report.filesChecked).toBe(1);
    expect(report.violations).toEqual([
      { file: "bunfig.toml", location: "install.exact", spec: "false", reason: "set [install] exact = true" },
    ]);
    expect(bad.stderr).toBe("");
  });

  test("exit 2 on unparseable file", () => {
    const { code, stderr } = cli(["--root", fixture("bad-cargo-invalid")]);
    expect(code).toBe(2);
    expect(stderr).toContain("Cargo.toml: invalid TOML");

    // Invalid JSON cannot live in fixtures/ (Biome would fail on it), so build it on the fly.
    const root = mkdtempSync(join(tmpdir(), "deps-exact-json-"));
    try {
      writeFileSync(join(root, "package.json"), "{ not json");
      const json = cli(["--root", root]);
      expect(json.code).toBe(2);
      expect(json.stderr).toContain("package.json: invalid JSON");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("exit 2 on usage errors", () => {
    expect(cli(["--bogus"]).code).toBe(2);
    expect(cli(["--root"]).code).toBe(2);
    expect(cli(["--root", join(FIXTURES, "does-not-exist")]).code).toBe(2);
  });

  test("defaults to the repository root and passes on it", () => {
    const { code, stdout } = cli([]);
    expect(stdout).toMatch(/^deps-exact: OK \(\d+ files checked\)$/m);
    expect(code).toBe(0);
  });
});
