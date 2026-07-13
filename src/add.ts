import { statSync } from "node:fs";
import { resolve } from "node:path";
import * as config from "./config.ts";
import * as pick from "./pick.ts";
import * as queue from "./queue.ts";

// The one door into the queue: the CLI, the web form, and watchers all come through
// here, and all any of them do is append.
// The directory is resolved here, not at launch: a queued line carries everything
// needed to start, and a bad guess surfaces while the user is still watching.
// `id` is supplied by watchers, which need it to be a deterministic function of the
// thing they saw -- that is what makes their output idempotent (see watch.ts).
export async function enqueue(rawPrompt: string, rawCwd?: string, id = queue.newId()): Promise<queue.Task> {
  const prompt = rawPrompt.trim();
  if (!prompt) throw new Error("prompt is required");

  let cwd = rawCwd?.trim() ? resolve(rawCwd.trim()) : undefined;
  if (!cwd) {
    const dirs = pick.candidates(config.config());
    if (!dirs.length) throw new Error(`no repositories found under the roots in ${config.FILE}`);
    cwd = await pick.pick(prompt, dirs);
    if (!cwd) throw new Error(`could not tell which directory this belongs to; pick one\n\n${dirs.join("\n")}`);
  }
  if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`not a directory: ${cwd}`);

  const task: queue.Task = { id, cwd, prompt };
  queue.add(task);
  return task;
}
