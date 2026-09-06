package produce

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func line(o map[string]any) string {
	b, err := json.Marshal(o)
	if err != nil {
		panic(err)
	}
	return string(b)
}

func TestParseReadsTaskLinesCwdOptional(t *testing.T) {
	stdout := strings.Join([]string{
		line(map[string]any{"id": "pr-1", "cwd": "/src/foo", "prompt": "review"}),
		"",
		line(map[string]any{"id": "pr-2", "prompt": "rebase"}),
	}, "\n")
	got, err := Parse(stdout)
	if err != nil {
		t.Fatal(err)
	}
	want := []Line{
		{ID: "pr-1", Cwd: "/src/foo", Prompt: "review"},
		{ID: "pr-2", Cwd: "", Prompt: "rebase"},
	}
	if !reflect.DeepEqual(want, got) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestParseRejectsAnIDThatWouldNotSurviveBeingAPathOrAWorkspaceName(t *testing.T) {
	cases := []string{
		line(map[string]any{"id": "https://x/pull/1", "prompt": "p"}),
		line(map[string]any{"id": "../../etc/passwd", "prompt": "p"}),
		line(map[string]any{"id": strings.Repeat("a", 65), "prompt": "p"}),
		line(map[string]any{"prompt": "p"}),
	}
	for _, c := range cases {
		if _, err := Parse(c); err == nil || !strings.Contains(err.Error(), "bad id") {
			t.Errorf("Parse(%q) = %v, want error containing \"bad id\"", c, err)
		}
	}
}

func TestParseRejectsALineWithNoPrompt(t *testing.T) {
	if _, err := Parse(line(map[string]any{"id": "pr-1", "prompt": " "})); err == nil ||
		!strings.Contains(err.Error(), "prompt is required") {
		t.Errorf("got %v, want error containing \"prompt is required\"", err)
	}
}

func TestParseFailsTheBatchNotTheLine(t *testing.T) {
	stdout := strings.Join([]string{line(map[string]any{"id": "pr-1", "prompt": "p"}), "{ oh no"}, "\n")
	if _, err := Parse(stdout); err == nil {
		t.Error("expected an error")
	}
}
