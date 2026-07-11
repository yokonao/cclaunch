import { statSync } from "node:fs";
import { resolve } from "node:path";
import * as pick from "./pick.ts";
import * as queue from "./queue.ts";

// Shared by the CLI and the web form: both only append to the queue.
export async function enqueue(rawPrompt: string, rawCwd?: string): Promise<queue.Task> {
  const prompt = rawPrompt.trim();
  if (!prompt) throw new Error("prompt is required");

  let cwd = rawCwd?.trim() ? resolve(rawCwd.trim()) : undefined;
  if (!cwd) {
    const dirs = pick.candidates(pick.config());
    if (!dirs.length) throw new Error(`no repositories found under the roots in ${pick.CONFIG_FILE}`);
    cwd = await pick.pick(prompt, dirs);
    if (!cwd) throw new Error(`could not tell which directory this belongs to; pick one\n\n${dirs.join("\n")}`);
  }
  if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`not a directory: ${cwd}`);

  const task: queue.Task = { id: queue.newId(), cwd, prompt };
  queue.add(task);
  return task;
}
