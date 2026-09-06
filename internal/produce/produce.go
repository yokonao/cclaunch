// Package produce runs producers -- executables in ~/.cclaunch/producers
// that print task lines to stdout -- and hands what comes back to
// enqueue.Enqueue. It knows nothing about GitHub, Slack, or whatever else a
// producer talks to; that is deliberate, since a producer's query and its
// prompt carry private things and this repository is public.
//
// cclaunch gives the launched agent no isolation: cmux hands it a worktree
// and a plain shell, with the user's ssh keys, gh token, and filesystem.
// Whatever a producer feeds in is read by an agent running as the user, so
// a producer must only ingest content from authors whose code the user
// would already run unread on this machine.
package produce

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/yokonao/cclaunch/internal/enqueue"
	"github.com/yokonao/cclaunch/internal/logx"
	"github.com/yokonao/cclaunch/internal/queue"
)

// Producers is the directory cclaunch scans for producer executables.
var Producers = filepath.Join(queue.Dir, "producers")

// Seen is the file of ids already queued from producers.
var Seen = filepath.Join(queue.Dir, "seen")

const timeout = 60 * time.Second

// Line is one task a producer printed.
type Line struct {
	ID     string
	Cwd    string
	Prompt string
}

// idPattern matches ids that survive being both a file name and a cmux
// workspace name.
var idPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)

// Parse reads producer stdout into lines. A malformed id is rejected
// outright rather than sanitized, since silently rewriting it would break
// the deduplication that ids exist for.
func Parse(stdout string) ([]Line, error) {
	var lines []Line
	for _, raw := range strings.Split(stdout, "\n") {
		if strings.TrimSpace(raw) == "" {
			continue
		}
		var l struct {
			ID     string `json:"id"`
			Cwd    string `json:"cwd"`
			Prompt string `json:"prompt"`
		}
		if err := json.Unmarshal([]byte(raw), &l); err != nil {
			return nil, err
		}
		if l.ID == "" || !idPattern.MatchString(l.ID) {
			return nil, fmt.Errorf("bad id: %q", l.ID)
		}
		if strings.TrimSpace(l.Prompt) == "" {
			return nil, fmt.Errorf("%s: prompt is required", l.ID)
		}
		lines = append(lines, Line{ID: l.ID, Cwd: l.Cwd, Prompt: l.Prompt})
	}
	return lines, nil
}

// SeenIDs returns the ids already queued from producers.
func SeenIDs() (map[string]bool, error) {
	raw, err := os.ReadFile(Seen)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]bool{}, nil
		}
		return nil, err
	}
	out := map[string]bool{}
	for _, id := range strings.Split(string(raw), "\n") {
		if strings.TrimSpace(id) != "" {
			out[id] = true
		}
	}
	return out, nil
}

// assertPrivate refuses a path that the group or the world can write to,
// the way ssh refuses a loose ~/.ssh.
func assertPrivate(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if info.Mode().Perm()&0o022 != 0 {
		return fmt.Errorf("group- or world-writable: %s", path)
	}
	return nil
}

// ListProducers returns the executable, non-hidden files directly under
// Producers, sorted by path.
func ListProducers() ([]string, error) {
	info, err := os.Stat(Producers)
	if err != nil || !info.IsDir() {
		return nil, nil
	}
	if err := assertPrivate(Producers); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(Producers)
	if err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") || e.IsDir() {
			continue
		}
		path := filepath.Join(Producers, e.Name())
		fi, err := os.Stat(path)
		if err != nil {
			return nil, err
		}
		if fi.Mode().Perm()&0o111 != 0 {
			out = append(out, path)
		}
	}
	sort.Strings(out)
	return out, nil
}

func runProducer(path string, log *logx.Logger) (string, error) {
	if err := assertPrivate(path); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, path)
	cmd.Dir = Producers
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return "", fmt.Errorf("no output after %ds", int(timeout.Seconds()))
	}
	if err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("%s", msg)
	}
	if msg := strings.TrimSpace(stderr.String()); msg != "" {
		log.Debug(fmt.Sprintf("producer %s stderr: %s", filepath.Base(path), msg))
	}
	return stdout.String(), nil
}

// Poll runs every producer once, queuing the lines whose ids have not been
// seen before.
func Poll(ctx context.Context, log *logx.Logger) error {
	done, err := SeenIDs()
	if err != nil {
		return err
	}
	paths, err := ListProducers()
	if err != nil {
		return err
	}
	log.Debug(fmt.Sprintf("polling %d producer(s)", len(paths)))

	for _, path := range paths {
		name := filepath.Base(path)
		out, err := runProducer(path, log)
		if err != nil {
			log.Info(fmt.Sprintf("producer %s: %v", name, err))
			continue
		}
		lines, err := Parse(out)
		if err != nil {
			log.Info(fmt.Sprintf("producer %s: %v", name, err))
			continue
		}

		newCount := 0
		for _, l := range lines {
			if !done[l.ID] {
				newCount++
			}
		}
		log.Debug(fmt.Sprintf("producer %s: %d line(s), %d new", name, len(lines), newCount))

		for _, l := range lines {
			if done[l.ID] {
				continue
			}
			task, err := enqueue.Enqueue(ctx, l.Prompt, l.Cwd, l.ID)
			if err != nil {
				log.Info(fmt.Sprintf("producer %s: %s: %v", name, l.ID, err))
				continue
			}
			// After the append, so a crash here repeats the task rather
			// than losing it. The repeat is harmless: queue.Remove drops
			// every line with the id, and cmux is asked whether the
			// workspace already exists before anything is launched.
			f, err := os.OpenFile(Seen, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
			if err != nil {
				return err
			}
			_, werr := f.WriteString(task.ID + "\n")
			if cerr := f.Close(); werr == nil {
				werr = cerr
			}
			if werr != nil {
				return werr
			}
			done[task.ID] = true
			log.Info(fmt.Sprintf("queued %s  %s  %s", task.ID, task.Cwd, task.Prompt))
		}
	}
	return nil
}
