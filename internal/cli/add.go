package cli

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
	"github.com/yokonao/cclaunch/internal/enqueue"
	"github.com/yokonao/cclaunch/internal/logx"
)

func newAddCmd() *cobra.Command {
	var cwd string
	cmd := &cobra.Command{
		Use:   `add [-C <dir>] "<prompt>"`,
		Short: "Append a task to the queue; without -C, the agent picks the directory",
		RunE: func(cmd *cobra.Command, args []string) error {
			log := logx.New(logx.Info)
			task, err := enqueue.Enqueue(cmd.Context(), strings.Join(args, " "), cwd, "")
			if err != nil {
				return err
			}
			log.Info(fmt.Sprintf("queued %s  %s  %s", task.ID, task.Cwd, task.Prompt))
			return nil
		},
	}
	cmd.Flags().StringVarP(&cwd, "cwd", "C", "", "directory the task should run in")
	return cmd
}
