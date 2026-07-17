// Levels in ascending order: a logger at `info` drops `debug` and prints the rest.
// The logger is itself callable at info level, so plain `log(...)` stays what it was.
const LEVELS = ["debug", "info"] as const;
export type Level = (typeof LEVELS)[number];
export type Log = ((...args: unknown[]) => void) & { debug: (...args: unknown[]) => void };

export const isLevel = (s: string): s is Level => (LEVELS as readonly string[]).includes(s);

// ISO 8601 in the OS-local timezone, e.g. 2026-07-17T13:51:00+09:00.
const stamp = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const tz = `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${tz}`
  );
};

export function make(level: Level): Log {
  const min = LEVELS.indexOf(level);
  const at =
    (l: Level) =>
    (...args: unknown[]): void => {
      if (LEVELS.indexOf(l) >= min) console.log(stamp(new Date()), ...args);
    };
  return Object.assign(at("info"), { debug: at("debug") });
}
