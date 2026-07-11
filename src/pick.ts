import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DIR } from "./queue.ts";

export type Config = { roots: string[]; depth: number };

export const CONFIG_FILE = join(DIR, "config.json");

const DEFAULT: Config = { roots: [join(homedir(), "src")], depth: 4 };

const expand = (p: string): string => (p.startsWith("~") ? homedir() + p.slice(1) : p);

export function config(): Config {
  let raw: string;
  try {
    raw = readFileSync(CONFIG_FILE, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT;
    throw e;
  }
  const { roots, depth } = JSON.parse(raw) as Partial<Config>;
  return {
    roots: (roots ?? DEFAULT.roots).map(expand),
    depth: depth ?? DEFAULT.depth,
  };
}

// A repo is a leaf: once a directory has .git, its subdirectories are its own
// business, not separate candidates.
export function candidates({ roots, depth }: Config): string[] {
  const out: string[] = [];
  const walk = (dir: string, left: number): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.name === ".git")) {
      out.push(dir);
      return;
    }
    if (left === 0) return;
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".")) walk(join(dir, e.name), left - 1);
    }
  };
  for (const root of roots) walk(root, depth);
  return out.sort();
}

export const promptFor = (task: string, dirs: string[]): string =>
  `Pick the directory this task should run in.

Task: ${task}

Directories:
${dirs.join("\n")}

Reply with exactly one path copied from the list, and nothing else.
If none of them clearly fits, reply NONE.`;

// The answer must be a member of the list: a hallucinated path would launch
// Claude somewhere the user never asked for, silently.
export function validate(answer: string, dirs: string[]): string | undefined {
  const line = answer.trim().split("\n").at(-1)?.trim();
  return line && dirs.includes(line) ? line : undefined;
}

export async function pick(task: string, dirs: string[]): Promise<string | undefined> {
  const proc = Bun.spawn(["claude", "-p", "--model", "haiku", promptFor(task, dirs)], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const [answer, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (code !== 0) throw new Error(`claude exited with ${code}`);
  return validate(answer, dirs);
}
