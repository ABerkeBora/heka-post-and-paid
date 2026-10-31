import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  closeSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";
export const LOCAL = resolve(".local");
mkdirSync(LOCAL, { recursive: true, mode: 0o700 });
export const statePath = resolve(LOCAL, "state.json");
export function readJson<T = any>(path: string): T | undefined {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}
export function writeJson(path: string, value: unknown) {
  mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 });
  const temporary = path + ".tmp";
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  renameSync(temporary, path);
}
export function load(): any {
  return readJson(statePath);
}
export function save(state: any) {
  state.updatedAt = new Date().toISOString();
  writeJson(statePath, state);
}
export async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const path = resolve(LOCAL, "execution.lock");
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch {
    const pid = Number(readFileSync(path, "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      if (Date.now() - statSync(path).mtimeMs > 1000) {
        unlinkSync(path);
        return exclusive(fn);
      }
      throw new Error("An action is initializing; retry shortly.");
    }
    try {
      process.kill(pid, 0);
    } catch {
      unlinkSync(path);
      return exclusive(fn);
    }
    throw new Error(
      "An agent action is already running. Its durable intent will be reconciled before another action.",
    );
  }
  writeFileSync(fd!, String(process.pid));
  try {
    return await fn();
  } finally {
    closeSync(fd!);
    unlinkSync(path);
  }
}
export function event(
  state: any,
  title: string,
  detail: string,
  status = "confirmed",
) {
  state.events.push({
    id: `${Date.now()}-${state.events.length}`,
    title,
    detail,
    status,
    at: new Date().toISOString(),
  });
  save(state);
}
