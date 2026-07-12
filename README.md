# cclaunch

Queue a task, and Claude Code starts working on it in its own [cmux](https://github.com/manaflow-ai/cmux) workspace.

You think of something while away from the repo, type one line, and forget about it. cclaunch picks
the task off the queue, opens a workspace in the right directory, and launches `claude` there. It
does the launching and nothing else -- cmux notifies you when a session needs input, and the
transcript stays in `~/.claude/projects`.

## Requires

`bun`, `cmux`, and `claude` on your `PATH`.

## Install

```sh
git clone https://github.com/yokonao/cclaunch && cd cclaunch
bun install
./install.sh            # drops a `cclaunch` shim in ~/.local/bin (pass a dir to change it)
```

## Use

Start the runner once, **inside a cmux workspace** -- cmux only grants socket access to its own
children, so this is the one process that can create workspaces:

```sh
cclaunch run
```

Then queue tasks from any terminal:

```sh
cclaunch add -C ~/src/foo "fix the type errors"
cclaunch add "rewrite the cclaunch README"      # -C omitted: Claude picks the directory
```

Without `-C`, the prompt is handed to `claude -p --model haiku` along with the repositories found
under your roots, and it picks one. The answer is checked against that list, and `add` fails if it
does not match -- launching in a directory you never asked for is worse than making you type `-C`.

`run` also serves a one-field form on `http://127.0.0.1:4747` for prompts too long to type in a
shell. It does exactly what `add` does: append one line.

## The queue

`~/.cclaunch/queue.jsonl`, one task per line, first line launches next.

```jsonl
{"id":"m9x1a2b3","cwd":"/Users/you/src/foo","prompt":"fix the type errors"}
```

There are no `list`, `remove`, or `reorder` commands, because `$EDITOR ~/.cclaunch/queue.jsonl` is
all of them. `run` watches the file, so hand edits and `add`s from other terminals take effect
immediately.

## Config

`~/.cclaunch/config.json`, optional, merged over the defaults:

```json
{ "roots": ["~/src"], "depth": 4, "port": 4747 }
```

`roots` and `depth` bound the search for candidate directories; a directory containing `.git` is a
candidate and is not descended into.
