// Package cfg reads ~/.cclaunch/config.json, merged over defaults.
package cfg

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/yokonao/cclaunch/internal/queue"
)

// Config is cclaunch's full configuration.
type Config struct {
	Agent     string   `json:"agent"`
	Roots     []string `json:"roots"`
	Depth     int      `json:"depth"`
	Port      int      `json:"port"`
	Producers bool     `json:"producers"`
	Interval  int      `json:"interval"`
}

// File is ~/.cclaunch/config.json.
var File = filepath.Join(queue.Dir, "config.json")

// Default is used for anything config.json does not set, and returned
// outright when the file does not exist.
var Default = Config{
	Agent:     "claude",
	Roots:     []string{defaultRoot()},
	Depth:     4,
	Port:      4747,
	Producers: false,
	Interval:  300,
}

func defaultRoot() string {
	home, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}
	return filepath.Join(home, "src")
}

func expand(p string) string {
	if strings.HasPrefix(p, "~") {
		home, err := os.UserHomeDir()
		if err != nil {
			panic(err)
		}
		return home + p[1:]
	}
	return p
}

type raw struct {
	Agent     *string   `json:"agent"`
	Roots     *[]string `json:"roots"`
	Depth     *int      `json:"depth"`
	Port      *int      `json:"port"`
	Producers *bool     `json:"producers"`
	Interval  *int      `json:"interval"`
}

// Load reads and validates the config, filling in defaults for anything
// unset.
func Load() (Config, error) {
	data, err := os.ReadFile(File)
	if err != nil {
		if os.IsNotExist(err) {
			return Default, nil
		}
		return Config{}, err
	}

	var r raw
	if err := json.Unmarshal(data, &r); err != nil {
		return Config{}, err
	}

	c := Default
	if r.Agent != nil {
		if *r.Agent != "claude" && *r.Agent != "codex" {
			return Config{}, fmt.Errorf("unknown agent %q (claude|codex)", *r.Agent)
		}
		c.Agent = *r.Agent
	}
	if r.Roots != nil {
		roots := make([]string, len(*r.Roots))
		for i, root := range *r.Roots {
			roots[i] = expand(root)
		}
		c.Roots = roots
	}
	if r.Depth != nil {
		c.Depth = *r.Depth
	}
	if r.Port != nil {
		c.Port = *r.Port
	}
	if r.Producers != nil {
		c.Producers = *r.Producers
	}
	if r.Interval != nil {
		c.Interval = *r.Interval
	}
	return c, nil
}
