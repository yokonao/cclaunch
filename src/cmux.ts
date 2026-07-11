import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { promptFile, type Task } from "./queue.ts";

async function cmux(...args: string[]): Promise<string> {
  const proc = Bun.spawn(["cmux", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(stderr.trim() || `cmux ${args[0]} exited with ${code}`);
  return stdout;
}

export const workspaceName = (id: string): string => `cclaunch-${id}`;

// `--command` is typed into the workspace's shell. Rather than quote the prompt
// into it, write the prompt to a file and let the shell read it back, so nothing
// the user typed is ever parsed as shell syntax. Only our own path is quoted.
export const shellQuote = (s: string): string => `'${s.replaceAll("'", `'\\''`)}'`;

export const command = (id: string): string => `claude "$(cat ${shellQuote(promptFile(id))})"`;

// Shape-agnostic: cmux's JSON nests workspaces, and the name field has been
// spelled both `name` and `title`. Matching on a wrong shape would silently
// drop a task, so collect every candidate rather than assume a layout.
export function names(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) names(child, out);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if ((key === "name" || key === "title") && typeof value === "string") out.push(value);
      else names(value, out);
    }
  }
  return out;
}

export async function hasWorkspace(name: string): Promise<boolean> {
  return names(JSON.parse(await cmux("workspace", "list", "--json"))).includes(name);
}

export async function launch({ id, cwd, prompt }: Task): Promise<void> {
  const file = promptFile(id);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, prompt);
  await cmux("new-workspace", "--name", workspaceName(id), "--cwd", cwd, "--command", command(id));
}
