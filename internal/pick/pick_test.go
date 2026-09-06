package pick

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func tree(t *testing.T, dirs ...string) string {
	t.Helper()
	root := t.TempDir()
	for _, dir := range dirs {
		if err := os.MkdirAll(filepath.Join(root, dir), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func TestCandidatesStopsAtGitAndRespectsDepth(t *testing.T) {
	root := tree(t, "a/.git", "a/nested/.git", "b/c/.git", "deep/1/2/3/.git", ".hidden/.git")
	got := Candidates([]string{root}, 2)
	want := []string{filepath.Join(root, "a"), filepath.Join(root, "b", "c")}
	if !reflect.DeepEqual(want, got) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestCandidatesIgnoresMissingRoots(t *testing.T) {
	got := Candidates([]string{"/no/such/place"}, 4)
	if len(got) != 0 {
		t.Errorf("got %v, want empty", got)
	}
}

func TestValidateAcceptsOnlyAListedPath(t *testing.T) {
	dirs := []string{"/src/foo", "/src/bar"}

	if got, ok := Validate("/src/foo\n", dirs); !ok || got != "/src/foo" {
		t.Errorf("got (%q, %v)", got, ok)
	}
	if got, ok := Validate("Sure! Here you go:\n/src/bar", dirs); !ok || got != "/src/bar" {
		t.Errorf("got (%q, %v)", got, ok)
	}
	if _, ok := Validate("/src/baz", dirs); ok {
		t.Error("expected no match")
	}
	if _, ok := Validate("NONE", dirs); ok {
		t.Error("expected no match")
	}
}

func TestCommandUsesTheConfiguredAgent(t *testing.T) {
	want := []string{"claude", "-p", "--model", "haiku", "pick"}
	if got := Command("claude", "pick"); !reflect.DeepEqual(want, got) {
		t.Errorf("got %v, want %v", got, want)
	}
	want = []string{"codex", "exec", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check", "pick"}
	if got := Command("codex", "pick"); !reflect.DeepEqual(want, got) {
		t.Errorf("got %v, want %v", got, want)
	}
}
