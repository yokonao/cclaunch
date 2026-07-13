import { appendFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { enqueue } from "./add.ts";
import { DIR } from "./queue.ts";

// A watcher is an executable that prints task lines to stdout. cclaunch runs it and
// hands what comes back to enqueue(); it knows nothing about GitHub, Slack, or whatever
// else the watcher talks to. That is deliberate, and not only for tidiness: a watcher's
// query and its prompt carry private things -- repository names, colleagues, tokens --
// and this repository is public. Keeping the two apart means none of that has anywhere
// to leak into.
//
// cclaunch gives the launched Claude NO isolation: cmux hands it a worktree and a plain
// shell, with your ssh keys, your gh token, and your filesystem. Whatever a watcher
// feeds in is read by an agent running as you. So a watcher must only ingest content
// from authors whose code you would already run unread on this machine -- your own
// repositories, your colleagues'. A drive-by pull request from a stranger is arbitrary
// code execution with a language model in the middle, and no filter here is a sandbox.
export const WATCHERS = join(DIR, "watchers");
export const SEEN = join(DIR, "seen");

const TIMEOUT = 60_000;

export type Line = {
  id: string;
  cwd?: string;
  prompt: string;
};

// The id becomes a file name and a cmux workspace name, so it cannot hold a slash. It is
// also the whole of the deduplication: a watcher is stateless and reprints every obligation
// it can still see on every poll, and only the id says whether that is the same one as last
// time. Rewriting a malformed one into something legal would quietly break exactly that, so
// reject it and say so instead.
const ID = /^[A-Za-z0-9._-]{1,64}$/;

export function parse(stdout: string): Line[] {
  return stdout
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const { id, cwd, prompt } = JSON.parse(line) as Partial<Line>;
      if (!id || !ID.test(id)) throw new Error(`bad id: ${JSON.stringify(id)}`);
      if (!prompt?.trim()) throw new Error(`${id}: prompt is required`);
      return { id, cwd, prompt };
    });
}

export function seen(): Set<string> {
  let raw: string;
  try {
    raw = readFileSync(SEEN, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw e;
  }
  return new Set(raw.split("\n").filter((id) => id.trim()));
}

// These run as you. Refuse anything the group or the world can write, the way ssh refuses
// a loose ~/.ssh: on a machine where nobody else can write here this changes nothing, and
// on one where they can it is the whole ballgame.
function assertPrivate(path: string): void {
  if (statSync(path).mode & 0o022) throw new Error(`group- or world-writable: ${path}`);
}

export function watchers(): string[] {
  if (!statSync(WATCHERS, { throwIfNoEntry: false })?.isDirectory()) return [];
  assertPrivate(WATCHERS);
  return readdirSync(WATCHERS, { withFileTypes: true })
    .filter((e) => !e.name.startsWith(".") && !e.isDirectory())
    .map((e) => join(WATCHERS, e.name))
    .filter((path) => statSync(path).mode & 0o111)
    .sort();
}

async function run(path: string): Promise<string> {
  assertPrivate(path);
  const proc = Bun.spawn([path], { stdout: "pipe", stderr: "pipe", cwd: WATCHERS });
  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    proc.kill();
  }, TIMEOUT);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (killed) throw new Error(`no output after ${TIMEOUT / 1000}s`);
    // Half a listing is worse than none: a watcher that dies partway looks, to the id
    // diff below, exactly like one whose obligations were met. Drop the batch.
    if (code !== 0) throw new Error(stderr.trim() || `exited with ${code}`);
    return stdout;
  } finally {
    clearTimeout(timer);
  }
}

export async function poll(log: (...args: unknown[]) => void): Promise<void> {
  const done = seen();
  for (const path of watchers()) {
    const name = basename(path);
    let lines: Line[];
    try {
      lines = parse(await run(path));
    } catch (e) {
      log(`watcher ${name}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const line of lines) {
      if (done.has(line.id)) continue;
      try {
        const task = await enqueue(line.prompt, line.cwd, line.id);
        // After the append, so a crash here repeats the task rather than losing it. The
        // repeat is harmless: `queue.remove` drops every line with the id, and cmux is
        // asked whether the workspace already exists before anything is launched.
        appendFileSync(SEEN, `${task.id}\n`);
        done.add(task.id);
        log(`queued ${task.id}  ${task.cwd}  ${task.prompt}`);
      } catch (e) {
        log(`watcher ${name}: ${line.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}
