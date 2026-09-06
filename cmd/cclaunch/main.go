// Command cclaunch queues tasks and launches Claude Code or Codex in a cmux
// workspace to work on them.
package main

import (
	"fmt"
	"os"

	"github.com/yokonao/cclaunch/internal/cli"
)

// version is set at build time via -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if err := cli.Execute(version); err != nil {
		fmt.Fprintf(os.Stderr, "cclaunch: %v\n", err)
		os.Exit(1)
	}
}
