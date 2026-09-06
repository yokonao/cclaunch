package cmux

import (
	"encoding/json"
	"reflect"
	"sort"
	"testing"

	"github.com/yokonao/cclaunch/internal/queue"
)

func TestShellQuoteEscapesSingleQuotes(t *testing.T) {
	if got, want := ShellQuote("fix it"), "'fix it'"; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
	if got, want := ShellQuote("don't"), `'don'\''t'`; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestCommandReadsThePromptFromAFileNeverInlinesIt(t *testing.T) {
	for _, agent := range []string{"claude", "codex"} {
		want := agent + ` "$(cat ` + ShellQuote(queue.PromptFile("abc")) + `)"`
		if got := Command("abc", agent); got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	}
}

func TestNamesCollectsNameOrTitleAtAnyDepth(t *testing.T) {
	raw := `{"workspaces": [{"name": "a", "panes": [{"title": "b"}]}, {"title": "c"}]}`
	var decoded any
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Fatal(err)
	}
	got := Names(decoded)
	sort.Strings(got)
	want := []string{"a", "b", "c"}
	if !reflect.DeepEqual(want, got) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestWorkspaceName(t *testing.T) {
	if got, want := WorkspaceName("abc"), "cclaunch-abc"; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}
