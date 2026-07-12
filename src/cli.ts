#!/usr/bin/env bun
import { mkdirSync, watch } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { enqueue } from "./add.ts";
import * as cmux from "./cmux.ts";
import * as config from "./config.ts";
import * as queue from "./queue.ts";
import * as web from "./web.ts";

const USAGE = `cclaunch run                         watch the queue and launch tasks (run inside cmux)
cclaunch add [-C <dir>] "<prompt>"  append a task; without -C, Claude picks the directory

run also serves a one-field web form on 127.0.0.1, for prompts too long to type in a shell.

queue:  ${queue.FILE}  (reorder / delete with $EDITOR)
config: ${config.FILE}  ${JSON.stringify(config.DEFAULT)}`;

const log = (...args: unknown[]): void => console.log(new Date().toISOString(), ...args);

function die(msg: string): never {
  console.error(`cclaunch: ${msg}\n\n${USAGE}`);
  process.exit(1);
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function cmdAdd(argv: string[]): Promise<void> {
  let values: { cwd?: string }, positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      options: { cwd: { type: "string", short: "C" } },
      allowPositionals: true,
    }));
  } catch (e) {
    die(message(e));
  }

  let task: queue.Task;
  try {
    task = await enqueue(positionals.join(" "), values.cwd);
  } catch (e) {
    die(message(e));
  }
  log(`queued ${task.id}  ${task.cwd}  ${task.prompt}`);
}

async function cmdRun(): Promise<never> {
  mkdirSync(queue.DIR, { recursive: true });
  // The form is a convenience; launching is the job. A taken port must not take
  // the runner down with it.
  try {
    web.serve(config.config().port, log);
  } catch (e) {
    log(`no web form: ${message(e)}`);
  }

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
