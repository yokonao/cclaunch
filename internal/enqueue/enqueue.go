// Package enqueue is the one door into the queue: the CLI, the web form,
// and producers all come through Enqueue, and all any of them do is
// append.
package enqueue

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/yokonao/cclaunch/internal/cfg"
	"github.com/yokonao/cclaunch/internal/pick"
	"github.com/yokonao/cclaunch/internal/queue"
)

// Enqueue resolves the directory (if not given) and appends a task to the
// queue. The directory is resolved here, not at launch: a queued line
// carries everything needed to start, and a bad guess surfaces while the
// user is still watching.
//
// id is supplied by producers, which need it to be a deterministic
// function of the thing they saw -- that is what makes their output
// idempotent. Pass "" to have one generated.
func Enqueue(ctx context.Context, rawPrompt, rawCwd, id string) (queue.Task, error) {
	prompt := strings.TrimSpace(rawPrompt)
	if prompt == "" {
		return queue.Task{}, fmt.Errorf("prompt is required")
	}
	if id == "" {
		id = queue.NewID()
	}

	cwd := strings.TrimSpace(rawCwd)
	if cwd != "" {
		abs, err := filepath.Abs(cwd)
		if err != nil {
			return queue.Task{}, err
		}
		cwd = abs
	} else {
		c, err := cfg.Load()
		if err != nil {
			return queue.Task{}, err
		}
		dirs := pick.Candidates(c.Roots, c.Depth)
		if len(dirs) == 0 {
			return queue.Task{}, fmt.Errorf("no repositories found under the roots in %s", cfg.File)
		}
		dir, ok, err := pick.Pick(ctx, prompt, dirs, c.Agent)
		if err != nil {
			return queue.Task{}, err
		}
		if !ok {
			return queue.Task{}, fmt.Errorf("could not tell which directory this belongs to; pick one\n\n%s", strings.Join(dirs, "\n"))
		}
		cwd = dir
	}

	info, err := os.Stat(cwd)
	if err != nil || !info.IsDir() {
		return queue.Task{}, fmt.Errorf("not a directory: %s", cwd)
	}

	task := queue.Task{ID: id, Cwd: cwd, Prompt: prompt}
	if err := queue.Add(task); err != nil {
		return queue.Task{}, err
	}
	return task, nil
}
