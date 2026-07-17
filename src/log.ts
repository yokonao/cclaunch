// Levels in ascending order: a logger at `info` drops `debug` and prints the rest.
// The logger is itself callable at info level, so plain `log(...)` stays what it was.
const LEVELS = ["debug", "info"] as const;
export type Level = (typeof LEVELS)[number];
export type Log = ((...args: unknown[]) => void) & { debug: (...args: unknown[]) => void };

export const isLevel = (s: string): s is Level => (LEVELS as readonly string[]).includes(s);

export function make(level: Level): Log {
  const min = LEVELS.indexOf(level);
  const at =
    (l: Level) =>
    (...args: unknown[]): void => {
      if (LEVELS.indexOf(l) >= min) console.log(new Date().toISOString(), ...args);
    };
  return Object.assign(at("info"), { debug: at("debug") });
}
