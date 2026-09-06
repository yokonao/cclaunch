package producerpoll

import (
	"testing"
	"time"
)

type timer struct {
	at time.Time
	f  func()
}

// fakeClock lets a test control time and fire scheduled callbacks by hand.
type fakeClock struct {
	now    time.Time
	timers chan timer
}

func newFakeClock() *fakeClock {
	return &fakeClock{now: time.Unix(0, 0), timers: make(chan timer, 8)}
}

func (c *fakeClock) clock() Clock {
	return Clock{
		Now: func() time.Time { return c.now },
		AfterFunc: func(d time.Duration, f func()) {
			c.timers <- timer{at: c.now.Add(d), f: f}
		},
	}
}

// tick fires the next scheduled timer, advancing the clock to its due time
// plus extra before running it, so the callback sees the time it fired at.
func (c *fakeClock) tick(t *testing.T, extra time.Duration) {
	t.Helper()
	select {
	case tm := <-c.timers:
		c.now = tm.at.Add(extra)
		tm.f()
	default:
		t.Fatal("no timer scheduled")
	}
}

func recv(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for poll")
	}
}

func expectNone(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
		t.Fatal("unexpected poll")
	case <-time.After(50 * time.Millisecond):
	}
}

func TestPollsImmediatelyAndOnTime(t *testing.T) {
	clock := newFakeClock()
	polls := make(chan struct{}, 8)
	Start(func() { polls <- struct{}{} }, 300*time.Second, func(string) {}, clock.clock())

	recv(t, polls)
	clock.tick(t, 0)
	recv(t, polls)
}

func TestPollsWhenATickIsAtMost30SecondsLate(t *testing.T) {
	clock := newFakeClock()
	polls := make(chan struct{}, 8)
	Start(func() { polls <- struct{}{} }, 300*time.Second, func(string) {}, clock.clock())

	recv(t, polls)
	clock.tick(t, 30*time.Second)
	recv(t, polls)
}

func TestSkipsATickMoreThan30SecondsLate(t *testing.T) {
	clock := newFakeClock()
	polls := make(chan struct{}, 8)
	var logs []string
	Start(func() { polls <- struct{}{} }, 300*time.Second, func(msg string) { logs = append(logs, msg) }, clock.clock())

	recv(t, polls)
	clock.tick(t, 30*time.Second+time.Millisecond)
	expectNone(t, polls)
	want := "producer poll skipped: 30001ms late"
	if len(logs) != 1 || logs[0] != want {
		t.Errorf("got %v, want [%q]", logs, want)
	}
}

func TestPollsOnTimeAfterAStaleTick(t *testing.T) {
	clock := newFakeClock()
	polls := make(chan struct{}, 8)
	Start(func() { polls <- struct{}{} }, 300*time.Second, func(string) {}, clock.clock())

	recv(t, polls)
	clock.tick(t, 30*time.Second+time.Millisecond)
	expectNone(t, polls)
	clock.tick(t, 0)
	recv(t, polls)
}

func TestDoesNotOverlapPolls(t *testing.T) {
	clock := newFakeClock()
	started := make(chan struct{}, 8)
	finish := make(chan struct{})
	polls := 0
	Start(func() {
		started <- struct{}{}
		polls++
		if polls == 1 {
			<-finish
		}
	}, 300*time.Second, func(string) {}, clock.clock())

	recv(t, started)
	clock.tick(t, 0)
	expectNone(t, started)

	close(finish)
	clock.tick(t, 0)
	recv(t, started)
}
