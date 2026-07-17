import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DIR } from "./queue.ts";

export type Config = {
  roots: string[];
  depth: number;
  port: number;
  producers: boolean;
  interval: number;
};

export const FILE = join(DIR, "config.json");

// `producers` is off by default: polling runs whatever executables sit in their directory,
// so `run` does it only when this asks. `interval` is the seconds between polls -- one for
// every producer. A producer that wants to run less often can say nothing most of the time,
// which is cheaper than teaching cclaunch a schedule.
export const DEFAULT: Config = { roots: [join(homedir(), "src")], depth: 4, port: 4747, producers: false, interval: 300 };

const expand = (p: string): string => (p.startsWith("~") ? homedir() + p.slice(1) : p);

export function config(): Config {
  let raw: string;
  try {
    raw = readFileSync(FILE, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT;
    throw e;
  }
  const { roots, depth, port, producers, interval } = JSON.parse(raw) as Partial<Config>;
  return {
    roots: (roots ?? DEFAULT.roots).map(expand),
    depth: depth ?? DEFAULT.depth,
    port: port ?? DEFAULT.port,
    producers: producers ?? DEFAULT.producers,
    interval: interval ?? DEFAULT.interval,
  };
}
