// Package logx is a two-level logger (debug, info) that stamps every line
// with an ISO 8601 timestamp in the OS-local timezone.
package logx

import (
	"fmt"
	"io"
	"os"
	"time"
)

// Level is a logging verbosity: debug or info.
type Level string

const (
	// Debug prints everything, including debug-level lines.
	Debug Level = "debug"
	// Info drops debug-level lines.
	Info Level = "info"
)

// IsLevel reports whether s names a known level.
func IsLevel(s string) bool {
	return Level(s) == Debug || Level(s) == Info
}

// Logger prints info and debug lines, dropping debug ones unless the level
// is Debug.
type Logger struct {
	level Level
	out   io.Writer
}

// New returns a Logger at the given level, writing to stdout.
func New(level Level) *Logger {
	return &Logger{level: level, out: os.Stdout}
}

func stamp(t time.Time) string {
	return t.Format("2006-01-02T15:04:05-07:00")
}

func (l *Logger) print(args ...any) {
	line := fmt.Sprintln(append([]any{stamp(time.Now())}, args...)...)
	_, _ = fmt.Fprint(l.out, line)
}

// Info prints unconditionally.
func (l *Logger) Info(args ...any) {
	l.print(args...)
}

// Debug prints only when the logger's level is Debug.
func (l *Logger) Debug(args ...any) {
	if l.level == Debug {
		l.print(args...)
	}
}
