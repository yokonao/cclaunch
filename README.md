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

## Producers

Most of what you queue by hand you did not think of -- someone else did, and it landed in a
ledger somewhere. A review was requested. A branch started conflicting. A comment came back and
is still sitting there. A producer takes that off you.

A producer is an executable in `~/.cclaunch/producers/` that prints task lines to stdout:

```jsonl
{"id":"pr-4821-a1b2c3d","cwd":"/Users/you/src/foo","prompt":"review the diff of PR 4821 ..."}
{"id":"pr-4790-9f8e7d6","prompt":"PR 4790 conflicts with main. rebase it, ..."}
```

Producers are off by default. Start the runner with `cclaunch run --producers` and it polls them,
appending the lines it has not seen to the queue. `cwd` is optional -- leave it out and Claude
picks the directory, as it does for `add`.

**Producers do not track what they have already emitted.** They print every obligation they can
still see, every time; cclaunch remembers the ids in `~/.cclaunch/seen` and only queues the new
ones. So make the id a function of what you saw and not of when you saw it -- `pr-4821-<head sha>`
rather than a timestamp. Then the same pull request stays quiet until it is pushed to again, and a
task that failed halfway does not fire twice. Delete a line from `seen` to run it once more.

cclaunch ships no producers, and knows nothing about GitHub, Slack, or anything else you point one
at. Your queries and your prompts carry your repositories, your colleagues, your tokens; this
repository is public. They stay yours -- keep the directory in a private repo of its own if you
like.

### What a producer may feed you

**cclaunch does not isolate anything.** cmux gives the launched Claude a worktree and a plain
shell -- your filesystem, your ssh keys, your gh token. So whatever a producer ingests is read by
an agent running as you, and text that reaches an agent is not inert: a pull request can carry
instructions in a comment or a fixture as easily as it carries code.

> Only ingest content from authors whose code you would already run, unread, on this machine.

That is the line you cross every time you check out a colleague's branch and run its tests, and
automating it crosses nothing new. A drive-by pull request on a public repository is a different
thing entirely, and no filter in a producer is a sandbox. Review those by hand, or in a container.

## Config

`~/.cclaunch/config.json`, optional, merged over the defaults:

```json
{ "roots": ["~/src"], "depth": 4, "port": 4747, "interval": 300 }
```

`interval` is the seconds between producer polls (only when `run --producers` is on), and there is
only one of it. A producer that wants to run less often can say nothing until it is ready.

`roots` and `depth` bound the search for candidate directories; a directory containing `.git` is a
candidate and is not descended into.

## License

MIT
