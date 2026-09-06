// Package producerpoll schedules producer polling on a fixed interval,
// skipping a tick that fires long after it was expected to (a laptop woken
// from sleep, say) rather than firing a burst of catch-up polls.
package producerpoll

import (
	"fmt"
	"sync"
	"time"
)

// maxDelay is how late a tick may fire and still run: past this, the
// system was asleep or stalled and a catch-up poll is not worth it.
const maxDelay = 30 * time.Second

// Clock abstracts time so the scheduling logic can be tested without real
// timers.
type Clock struct {
	Now       func() time.Time
	AfterFunc func(d time.Duration, f func())
}

// RealClock drives StartProducerPolling with the wall clock.
var RealClock = Clock{
	Now: time.Now,
	AfterFunc: func(d time.Duration, f func()) {
		time.AfterFunc(d, f)
	},
}

// Start polls immediately, then every interval, skipping a tick that fires
// more than 30s late. It never runs two polls at once: a tick that lands
// while the previous poll is still running is dropped, since a producer's
// output is stateless and the next tick will see everything this one
// would have.
func Start(run func(), interval time.Duration, debug func(string), clock Clock) {
	var mu sync.Mutex
	polling := false

	poll := func() {
		mu.Lock()
		if polling {
			mu.Unlock()
			return
		}
		polling = true
		mu.Unlock()

		defer func() {
			mu.Lock()
			polling = false
			mu.Unlock()
		}()
		run()
	}

	var schedule func()
	schedule = func() {
		expectedAt := clock.Now().Add(interval)
		clock.AfterFunc(interval, func() {
			delay := clock.Now().Sub(expectedAt)
			if delay <= maxDelay {
				go poll()
			} else {
				debug(fmt.Sprintf("producer poll skipped: %dms late", delay.Milliseconds()))
			}
			schedule()
		})
	}

	schedule()
	go poll()
}
