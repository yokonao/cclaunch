import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export const DIR = join(homedir(), ".cclaunch");
export const FILE = join(DIR, "queue.jsonl");

export const newId = () => Date.now().toString(36) + randomBytes(3).toString("hex");

export function read() {
  let raw;
  try {
    raw = readFileSync(FILE, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export function add(task) {
  mkdirSync(DIR, { recursive: true });
  appendFileSync(FILE, JSON.stringify(task) + "\n");
}

// Re-reads before writing so an `add` racing with a launch is not dropped.
export function remove(id) {
  const rest = read().filter((task) => task.id !== id);
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, rest.map((task) => JSON.stringify(task) + "\n").join(""));
  renameSync(tmp, FILE);
}
