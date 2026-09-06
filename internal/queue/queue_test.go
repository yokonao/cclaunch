package queue

import (
	"path/filepath"
	"reflect"
	"testing"
)

func withTempDir(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	oldDir, oldFile := Dir, File
	Dir, File = dir, filepath.Join(dir, "queue.jsonl")
	t.Cleanup(func() { Dir, File = oldDir, oldFile })
}

func TestAddReadRemove(t *testing.T) {
	withTempDir(t)

	a := Task{ID: "a", Cwd: "/src/a", Prompt: "do a"}
	b := Task{ID: "b", Cwd: "/src/b", Prompt: "do b"}
	if err := Add(a); err != nil {
		t.Fatal(err)
	}
	if err := Add(b); err != nil {
		t.Fatal(err)
	}

	got, err := Read()
	if err != nil {
		t.Fatal(err)
	}
	want := []Task{a, b}
	if !reflect.DeepEqual(want, got) {
		t.Errorf("got %v, want %v", got, want)
	}

	if err := Remove("a"); err != nil {
		t.Fatal(err)
	}
	got, err = Read()
	if err != nil {
		t.Fatal(err)
	}
	want = []Task{b}
	if !reflect.DeepEqual(want, got) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestReadMissingFile(t *testing.T) {
	withTempDir(t)
	got, err := Read()
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Errorf("got %v, want empty", got)
	}
}

func TestNewIDIsUnique(t *testing.T) {
	a, b := NewID(), NewID()
	if a == b {
		t.Errorf("expected distinct ids, got %q twice", a)
	}
}

