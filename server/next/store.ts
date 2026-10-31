import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";
import { readJson, writeJson } from "../store";
export const V2_LOCAL = resolve(".local/v2");
mkdirSync(V2_LOCAL, { recursive: true, mode: 0o700 });
export const V2_STATE = resolve(V2_LOCAL, "state.json");
export const loadNext = () => readJson<any>(V2_STATE);
export function saveNext(state: any) {
  state.updatedAt = new Date().toISOString();
  writeJson(V2_STATE, state);
}
export function logNext(
  state: any,
  title: string,
  detail: string,
  status = "confirmed",
) {
  state.events ||= [];
  state.events.push({
    id: `${Date.now()}-${state.events.length}`,
    title,
    detail,
    status,
    at: new Date().toISOString(),
  });
  saveNext(state);
}
export async function exclusiveNext<T>(fn: () => Promise<T>): Promise<T> {
  const file = resolve(V2_LOCAL, "execution.lock");
  let fd: number;
  try {
    fd = openSync(file, "wx", 0o600);
  } catch {
    const pid = Number(readFileSync(file, "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      if (Date.now() - statSync(file).mtimeMs > 1000) {
        unlinkSync(file);
        return exclusiveNext(fn);
      }
      throw new Error("V2 action is initializing.");
    }
    try {
      process.kill(pid, 0);
    } catch {
      unlinkSync(file);
      return exclusiveNext(fn);
    }
    throw new Error(
      "A creator-intake action is already running. Its receipt must reconcile first.",
    );
  }
  writeFileSync(fd!, String(process.pid));
  try {
    return await fn();
  } finally {
    closeSync(fd!);
    unlinkSync(file);
  }
}
