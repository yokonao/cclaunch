// Package cli wires cclaunch's cobra commands.
package cli

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/yokonao/cclaunch/internal/cfg"
	"github.com/yokonao/cclaunch/internal/produce"
	"github.com/yokonao/cclaunch/internal/queue"
)

// Execute runs the root command.
func Execute(version string) error {
	return newRootCmd(version).Execute()
}

func newRootCmd(version string) *cobra.Command {
	root := &cobra.Command{
		Use:     "cclaunch",
		Version: version,
		Short:   "Queue a task; Claude Code or Codex works on it in its own cmux workspace",
		Long: fmt.Sprintf(`Queue a task; Claude Code or Codex works on it in its own cmux workspace.

run also serves a one-field web form on 127.0.0.1, for prompts too long to
type in a shell. With "producers": true in config it also polls the
producers -- executables that print task lines.

queue:     %s  (reorder / delete with $EDITOR)
producers: %s  (seen ids: %s -- delete a line to run it again)
config:    %s`, queue.File, produce.Producers, produce.Seen, cfg.File),
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.AddCommand(newAddCmd())
	root.AddCommand(newRunCmd())
	return root
}
