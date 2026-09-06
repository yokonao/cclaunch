package cli

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/spf13/cobra"
	"github.com/yokonao/cclaunch/internal/cfg"
	"github.com/yokonao/cclaunch/internal/cmux"
	"github.com/yokonao/cclaunch/internal/logx"
	"github.com/yokonao/cclaunch/internal/produce"
	"github.com/yokonao/cclaunch/internal/producerpoll"
	"github.com/yokonao/cclaunch/internal/queue"
	"github.com/yokonao/cclaunch/internal/webui"
)

// park is how long the launch loop waits for a queue-file watch event
// before re-reading the queue anyway. The watch only decides how fast a
// change is noticed, never whether: it has gone silent across a laptop
// sleep, and it never reports queue.Remove's rename under the queue's own
// name. Re-reading a small file every few seconds costs nothing and turns
// a missed event into a delay instead of a stall.
const park = 5 * time.Second

func newRunCmd() *cobra.Command {
	var level string
	cmd := &cobra.Command{
		Use:   "run",
		Short: "Watch the queue and launch tasks (run inside cmux)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			if level != "" && !logx.IsLevel(level) {
				return fmt.Errorf("unknown log level %q (debug|info)", level)
			}
			lvl := logx.Info
			if level != "" {
				lvl = logx.Level(level)
			}
			return run(cmd.Context(), logx.New(lvl))
		},
	}
	cmd.Flags().StringVar(&level, "log-level", "", "debug|info (default info)")
	return cmd
}

func run(ctx context.Context, log *logx.Logger) error {
	if err := os.MkdirAll(queue.Dir, 0o755); err != nil {
		return err
	}
	config, err := cfg.Load()
	if err != nil {
		return err
	}
	if err := webui.Serve(config.Port, log); err != nil {
		return err
	}

	// Off unless config.json opts in: polling runs whatever executables sit
	// in the producers directory, and that is not something run should do
	// unasked.
	if config.Producers {
		producerpoll.Start(func() {
			if err := produce.Poll(ctx, log); err != nil {
				log.Info(fmt.Sprintf("producers: %v", err))
			}
		}, time.Duration(config.Interval)*time.Second, func(msg string) { log.Debug(msg) }, producerpoll.RealClock)
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer func() { _ = watcher.Close() }()
	if err := watcher.Add(queue.Dir); err != nil {
		return err
	}

	wake := make(chan struct{}, 1)
	go func() {
		base := filepath.Base(queue.File)
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if filepath.Base(event.Name) == base {
					select {
					case wake <- struct{}{}:
					default:
					}
				}
			case _, ok := <-watcher.Errors:
				if !ok {
					return
				}
			}
		}
	}()

	changed := func() {
		select {
		case <-wake:
		case <-time.After(park):
		}
	}

	log.Info(fmt.Sprintf("watching %s", queue.File))
	for {
		tasks, err := queue.Read()
		if err != nil {
			log.Info(fmt.Sprintf("cannot read queue: %v", err))
			changed()
			continue
		}
		if len(tasks) == 0 {
			changed()
			continue
		}
		task := tasks[0]

		if err := launchOne(task, config.Agent, log); err != nil {
			log.Info(fmt.Sprintf("failed %s: %v", task.ID, err))
			time.Sleep(5 * time.Second)
		}
	}
}

// launchOne launches before removing, so a crash duplicates rather than
// drops the task -- the workspace name lets cmux itself answer "did this
// already start?".
func launchOne(task queue.Task, agent string, log *logx.Logger) error {
	has, err := cmux.HasWorkspace(cmux.WorkspaceName(task.ID))
	if err != nil {
		return err
	}
	if has {
		log.Info(fmt.Sprintf("already running %s, dropping", task.ID))
	} else {
		if err := cmux.Launch(task, agent); err != nil {
			return err
		}
		log.Info(fmt.Sprintf("launched %s  %s  %s", task.ID, task.Cwd, task.Prompt))
	}
	return queue.Remove(task.ID)
}
