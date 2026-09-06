// Package queue implements the on-disk task queue: a JSONL file of pending
// tasks. There is no list/remove/reorder command because $EDITOR is the UI:
// a human reorders lines by hand. Keeping done entries would take that away
// too -- remove would have to decide between deleting and flagging instead
// of just dropping the line.
package queue

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Task is one line of the queue.
type Task struct {
	ID     string `json:"id"`
	Cwd    string `json:"cwd"`
	Prompt string `json:"prompt"`
}

var homeDir = mustHome()

func mustHome() string {
	h, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}
	return h
}

// Dir is ~/.cclaunch.
var Dir = filepath.Join(homeDir, ".cclaunch")

// File is the queue file itself.
var File = filepath.Join(Dir, "queue.jsonl")

// PromptFile is where a task's prompt is written before launch, so the
// shell command can read it back without the prompt ever being parsed as
// shell syntax.
func PromptFile(id string) string {
	return filepath.Join(Dir, "prompts", id+".txt")
}

// NewID returns a short id: the current time base36 plus three random bytes
// hex-encoded, so ids sort roughly chronologically and never collide.
func NewID() string {
	b := make([]byte, 3)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return strconv.FormatInt(time.Now().UnixMilli(), 36) + hex.EncodeToString(b)
}

// Read returns the pending tasks, in order, or an empty slice if the queue
// file does not exist yet.
func Read() ([]Task, error) {
	raw, err := os.ReadFile(File)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var tasks []Task
	for _, line := range strings.Split(string(raw), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		var t Task
		if err := json.Unmarshal([]byte(line), &t); err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	return tasks, nil
}

// Add appends a task to the queue.
func Add(task Task) error {
	if err := os.MkdirAll(Dir, 0o755); err != nil {
		return err
	}
	line, err := json.Marshal(task)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(File, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	_, werr := f.Write(append(line, '\n'))
	if cerr := f.Close(); werr == nil {
		werr = cerr
	}
	return werr
}

// Remove drops every line with the given id. It re-reads before writing so
// an add racing with a launch is not dropped.
func Remove(id string) error {
	tasks, err := Read()
	if err != nil {
		return err
	}
	var b strings.Builder
	for _, t := range tasks {
		if t.ID == id {
			continue
		}
		line, err := json.Marshal(t)
		if err != nil {
			return err
		}
		b.Write(line)
		b.WriteByte('\n')
	}
	tmp := File + ".tmp"
	if err := os.WriteFile(tmp, []byte(b.String()), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, File)
}
