// Package cmux drives the cmux CLI: it launches a task in its own
// workspace and asks whether one already exists for a given task id.
package cmux

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/yokonao/cclaunch/internal/queue"
)

func run(args ...string) (string, error) {
	cmd := exec.Command("cmux", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = fmt.Sprintf("cmux %s failed: %v", args[0], err)
		}
		return "", fmt.Errorf("%s", msg)
	}
	return stdout.String(), nil
}

// WorkspaceName is the cmux workspace name for a task id.
func WorkspaceName(id string) string {
	return "cclaunch-" + id
}

// ShellQuote wraps s in single quotes for the POSIX shell, escaping any
// single quotes it contains.
func ShellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// Command builds the shell command typed into the workspace. The prompt is
// written to a file and read back by the shell rather than quoted into the
// command, so nothing the user typed is ever parsed as shell syntax.
func Command(id, agent string) string {
	return fmt.Sprintf("%s \"$(cat %s)\"", agent, ShellQuote(queue.PromptFile(id)))
}

// Names collects every "name" or "title" string field at any depth of a
// decoded JSON value. cmux's JSON nests workspaces, and the name field has
// been spelled both ways -- matching on a wrong shape would silently drop a
// task, so collect every candidate rather than assume a layout.
func Names(node any) []string {
	var out []string
	var walk func(n any)
	walk = func(n any) {
		switch v := n.(type) {
		case []any:
			for _, child := range v {
				walk(child)
			}
		case map[string]any:
			for key, value := range v {
				if (key == "name" || key == "title") && isString(value) {
					out = append(out, value.(string))
				} else {
					walk(value)
				}
			}
		}
	}
	walk(node)
	return out
}

func isString(v any) bool {
	_, ok := v.(string)
	return ok
}

// HasWorkspace reports whether cmux already has a workspace with the given
// name.
func HasWorkspace(name string) (bool, error) {
	out, err := run("workspace", "list", "--json")
	if err != nil {
		return false, err
	}
	var decoded any
	if err := json.Unmarshal([]byte(out), &decoded); err != nil {
		return false, err
	}
	for _, n := range Names(decoded) {
		if n == name {
			return true, nil
		}
	}
	return false, nil
}

// Launch writes the task's prompt to disk and opens a cmux workspace for
// it. Callers should check HasWorkspace first and remove the task from the
// queue only after this succeeds, so a crash duplicates rather than drops
// the task.
func Launch(task queue.Task, agent string) error {
	file := queue.PromptFile(task.ID)
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(file, []byte(task.Prompt), 0o644); err != nil {
		return err
	}
	_, err := run("new-workspace", "--name", WorkspaceName(task.ID), "--cwd", task.Cwd, "--command", Command(task.ID, agent))
	return err
}
