import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import type { AppError } from "@/bindings";
import { errorMessages } from "@/lib/errors";
import { commands, forWindow, IpcError, unwrap } from "@/lib/ipc";

afterEach(() => clearMocks());

const info = { version: "0.1.0", build_channel: "dev" } as const;
const ok = <T>(data: T) => Promise.resolve({ status: "ok", data } as const);
const fail = (error: unknown) => Promise.resolve({ status: "error", error } as { status: "error"; error: AppError });

const kinds: AppError[] = [
  { kind: "not_found" },
  { kind: "validation", field: "siren", key: "validation.siren.invalid" },
  { kind: "conflict", key: "conflict.note" },
  { kind: "permission_denied", resource: "calendar" },
  { kind: "calendar_unavailable" },
  { kind: "maintenance" },
  { kind: "schema_mismatch" },
  { kind: "storage" },
  { kind: "internal" },
];

describe("unwrap", () => {
  it("returns the data of an ok result", async () => {
    await expect(unwrap(ok(info))).resolves.toEqual(info);
  });

  it.each(kinds)("throws IpcError for $kind", async (error) => {
    const thrown = await unwrap(fail(error)).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(IpcError);
    expect((thrown as IpcError).error).toEqual(error);
    expect((thrown as IpcError).message).toBe(errorMessages[`error.${error.kind}`]);
  });

  it("maps a plain-string failure (ACL denial) to internal without leaking it", async () => {
    const thrown = (await unwrap(fail("app_info not allowed: /Users/x/secret")).catch((e: unknown) => e)) as IpcError;
    expect(thrown.error).toEqual({ kind: "internal" });
    expect(thrown.message).toBe(errorMessages["error.internal"]);
    expect(thrown.message).not.toContain("secret");
  });

  it("maps an unknown kind or a rejection to internal", async () => {
    await expect(unwrap(fail({ kind: "weird" }))).rejects.toMatchObject({ error: { kind: "internal" } });
    await expect(unwrap(Promise.reject(new Error("boom /tmp/x")))).rejects.toMatchObject({
      error: { kind: "internal" },
      message: errorMessages["error.internal"],
    });
  });
});

describe("commands through mockIPC", () => {
  it("round-trips app_info", async () => {
    mockIPC((cmd) => (cmd === "app_info" ? info : undefined));
    await expect(unwrap(commands.appInfo())).resolves.toEqual(info);
  });

  it("turns a rejected string into internal", async () => {
    mockIPC(() => Promise.reject("not allowed"));
    await expect(unwrap(commands.appInfo())).rejects.toMatchObject({ error: { kind: "internal" } });
  });

  it("turns a rejected AppError into IpcError", async () => {
    mockIPC(() => Promise.reject({ kind: "maintenance" }));
    await expect(unwrap(commands.appInfo())).rejects.toMatchObject({ error: { kind: "maintenance" } });
  });
});

describe("forWindow", () => {
  it("returns the base command in main", () => {
    mockWindows("main");
    expect(forWindow("appInfo")).toBe(commands.appInfo);
  });

  it("returns the wrapper in another window", () => {
    mockWindows("settings");
    const wrapper = () => ok(info);
    expect(forWindow("appInfo", { settingsAppInfo: wrapper })).toBe(wrapper);
  });

  it("maps hyphens in the label", () => {
    mockWindows("tray-popover");
    const wrapper = () => ok(info);
    expect(forWindow("appInfo", { trayPopoverAppInfo: wrapper })).toBe(wrapper);
  });

  it("throws internal when the wrapper is missing", () => {
    mockWindows("settings");
    expect(() => forWindow("appInfo")).toThrow(IpcError);
    expect(() => forWindow("appInfo", {})).toThrowError(errorMessages["error.internal"]);
  });
});
