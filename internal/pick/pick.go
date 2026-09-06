// Package pick finds candidate repository directories and asks the
// configured agent which one a task belongs in.
package pick

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

// Candidates walks roots up to depth looking for repositories. A directory
// is a leaf as soon as it contains .git: its subdirectories are its own
// business, not separate candidates.
func Candidates(roots []string, depth int) []string {
	var out []string
	var walk func(dir string, left int)
	walk = func(dir string, left int) {
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, e := range entries {
			if e.Name() == ".git" {
				out = append(out, dir)
				return
			}
		}
		if left == 0 {
			return
		}
		for _, e := range entries {
			if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
				walk(filepath.Join(dir, e.Name()), left-1)
			}
		}
	}
	for _, root := range roots {
		walk(root, depth)
	}
	sort.Strings(out)
	return out
}

// PromptFor builds the prompt handed to the picking agent.
func PromptFor(task string, dirs []string) string {
	return fmt.Sprintf(`Pick the directory this task should run in.

Task: %s

Directories:
%s

Reply with exactly one path copied from the list, and nothing else.
If none of them clearly fits, reply NONE.`, task, strings.Join(dirs, "\n"))
}

// Validate reports the answer only if it is exactly one of dirs -- a
// hallucinated path would launch an agent somewhere the user never asked
// for, silently.
func Validate(answer string, dirs []string) (string, bool) {
	lines := strings.Split(strings.TrimSpace(answer), "\n")
	line := strings.TrimSpace(lines[len(lines)-1])
	if line == "" {
		return "", false
	}
	for _, d := range dirs {
		if d == line {
			return line, true
		}
	}
	return "", false
}

// Command builds the argv used to ask the agent to pick a directory.
func Command(agent, prompt string) []string {
	if agent == "claude" {
		return []string{"claude", "-p", "--model", "haiku", prompt}
	}
	return []string{"codex", "exec", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check", prompt}
}

// Pick runs the configured agent and returns the directory it chose, or
// false if it did not choose one from the list.
func Pick(ctx context.Context, task string, dirs []string, agent string) (string, bool, error) {
	argv := Command(agent, PromptFor(task, dirs))
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return "", false, fmt.Errorf("%s exited with %d", agent, exitErr.ExitCode())
		}
		return "", false, err
	}
	dir, ok := Validate(stdout.String(), dirs)
	return dir, ok, nil
}
