import { readdirSync } from "node:fs";
import { join } from "node:path";

// A repo is a leaf: once a directory has .git, its subdirectories are its own
// business, not separate candidates.
export function candidates({ roots, depth }: { roots: string[]; depth: number }): string[] {
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
