import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DIR } from "./queue.ts";

export type Config = {
  roots: string[];
  depth: number;
  port: number;
  interval: number;
};

export const FILE = join(DIR, "config.json");

// One interval for every watcher. A watcher that wants to run less often can say nothing
// most of the time, which is cheaper than teaching cclaunch a schedule.
export const DEFAULT: Config = { roots: [join(homedir(), "src")], depth: 4, port: 4747, interval: 300 };

const expand = (p: string): string => (p.startsWith("~") ? homedir() + p.slice(1) : p);

export function config(): Config {
  let raw: string;
  try {
    raw = readFileSync(FILE, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT;
    throw e;
  }
  const { roots, depth, port, interval } = JSON.parse(raw) as Partial<Config>;
  return {
    roots: (roots ?? DEFAULT.roots).map(expand),
    depth: depth ?? DEFAULT.depth,
    port: port ?? DEFAULT.port,
    interval: interval ?? DEFAULT.interval,
  };
}
