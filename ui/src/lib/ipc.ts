import { getCurrentWindow } from "@tauri-apps/api/window";
import { type AppError, commands } from "@/bindings";
import { isAppError, messageFor } from "@/lib/errors";

export * from "@/bindings";

type Result<T, E> = { status: "ok"; data: T } | { status: "error"; error: E };

/** A command failure as a thrown value. `message` is the French copy, never the raw payload. */
export class IpcError extends Error {
  readonly error: AppError;

  constructor(error: AppError) {
    super(messageFor(error));
    this.name = "IpcError";
    this.error = error;
  }
}

const internal = (): IpcError => new IpcError({ kind: "internal" });

/**
 * Turns a command result into its value, or throws `IpcError`. Anything that is not a known `AppError`
 * (an ACL denial arrives as a plain string, a framework failure as an `Error`) becomes `Internal`, and its
 * text is dropped: it may carry paths or other data.
 */
export async function unwrap<T>(promise: Promise<Result<T, AppError>>): Promise<T> {
  let result: Result<T, AppError>;
  try {
    result = await promise;
  } catch {
    throw internal();
  }
  if (result.status === "ok") return result.data;
  throw isAppError(result.error) ? new IpcError(result.error) : internal();
}

type Commands = typeof commands;

/** `appInfo` → `app_info`. */
const toSnake = (name: string): string => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** `tray_popover__app_info` → `trayPopoverAppInfo`, the rendering tauri-specta gives wrapper commands. */
const toCamel = (name: string): string =>
  name
    .split("_")
    .filter(Boolean)
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");

/**
 * The WS3 convention: `main` calls the base command, any other window calls its own
 * `<label>__<base>` wrapper (same arguments and result). Throws `IpcError` (`Internal`) when the wrapper
 * does not exist. `registry` is only a seam for tests.
 */
export function forWindow<K extends keyof Commands>(
  base: K,
  registry: Record<string, unknown> = commands,
): Commands[K] {
  const label = getCurrentWindow().label;
  if (label === "main") return commands[base];
  const name = toCamel(`${label.replaceAll("-", "_")}__${toSnake(base)}`);
  const wrapper = Object.hasOwn(registry, name) ? registry[name] : undefined;
  if (typeof wrapper !== "function") throw internal();
  return wrapper as Commands[K];
}
