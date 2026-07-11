#!/usr/bin/env bun
import { mkdirSync, statSync, watch } from "node:fs";
import { basename, resolve } from "node:path";
import * as cmux from "./cmux.ts";
import * as pick from "./pick.ts";
import * as queue from "./queue.ts";

const USAGE = `cclaunch run                          watch the queue and launch tasks (run inside cmux)
cclaunch add [-C <dir>] "<prompt>"   append a task; without -C, Claude picks the directory

queue:  ${queue.FILE}  (reorder / delete with $EDITOR)
config: ${pick.CONFIG_FILE}  ({"roots": ["~/src"], "depth": 4})`;

const log = (...args: unknown[]): void => console.log(new Date().toISOString(), ...args);

function die(msg: string): never {
  console.error(`cclaunch: ${msg}\n\n${USAGE}`);
  process.exit(1);
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function cmdAdd(args: string[]): Promise<void> {
  let cwd: string | undefined;
  if (args[0] === "-C") {
    cwd = resolve(args[1] ?? die("-C needs a directory"));
    args = args.slice(2);
  }
  const prompt = args.join(" ").trim();
  if (!prompt) die("prompt is required");

  if (!cwd) {
    const dirs = pick.candidates(pick.config());
    if (!dirs.length) die(`no repositories found under the roots in ${pick.CONFIG_FILE}`);
    cwd = await pick.pick(prompt, dirs);
    if (!cwd) die(`could not tell which directory this belongs to; pass -C\n\n${dirs.join("\n")}`);
  }
  if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) die(`not a directory: ${cwd}`);

  const task: queue.Task = { id: queue.newId(), cwd, prompt };
  queue.add(task);
  log(`queued ${task.id}  ${cwd}  ${prompt}`);
}

async function cmdRun(): Promise<never> {
  mkdirSync(queue.DIR, { recursive: true });

  let wake: () => void = () => {};
  // Watch the directory, not the file: `remove` replaces it via rename.
  watch(queue.DIR, (_, name) => {
    if (name === basename(queue.FILE)) wake();
  });
  const changed = () => new Promise<void>((r) => (wake = r));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  log(`watching ${queue.FILE}`);
  for (;;) {
    let task: queue.Task | undefined;
    try {
      [task] = queue.read();
    } catch (e) {
      log(`cannot read queue: ${message(e)}`);
      await changed();
      continue;
    }
    if (!task) {
      await changed();
      continue;
    }

    try {
      // Launch before removing, so a crash duplicates rather than drops.
      // The name lets cmux itself answer "did this already start?".
      if (await cmux.hasWorkspace(cmux.workspaceName(task.id))) {
        log(`already running ${task.id}, dropping`);
      } else {
        await cmux.launch(task);
        log(`launched ${task.id}  ${task.cwd}  ${task.prompt}`);
      }
      queue.remove(task.id);
    } catch (e) {
      log(`failed ${task.id}: ${message(e).trim()}`);
      await sleep(5000);
    }
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "add") await cmdAdd(args);
else if (cmd === "run") await cmdRun();
else die(cmd ? `unknown command "${cmd}"` : "no command given");
