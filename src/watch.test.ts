import { expect, test } from "bun:test";
import { parse } from "./watch.ts";

const line = (o: object): string => JSON.stringify(o);

test("parse reads task lines, cwd optional", () => {
  const stdout = [line({ id: "pr-1", cwd: "/src/foo", prompt: "review" }), "", line({ id: "pr-2", prompt: "rebase" })].join("\n");
  expect(parse(stdout)).toEqual([
    { id: "pr-1", cwd: "/src/foo", prompt: "review" },
    { id: "pr-2", cwd: undefined, prompt: "rebase" },
  ]);
});

test("parse rejects an id that would not survive being a path or a workspace name", () => {
  expect(() => parse(line({ id: "https://x/pull/1", prompt: "p" }))).toThrow(/bad id/);
  expect(() => parse(line({ id: "../../etc/passwd", prompt: "p" }))).toThrow(/bad id/);
  expect(() => parse(line({ id: "a".repeat(65), prompt: "p" }))).toThrow(/bad id/);
  expect(() => parse(line({ prompt: "p" }))).toThrow(/bad id/);
});

test("parse rejects a line with no prompt", () => {
  expect(() => parse(line({ id: "pr-1", prompt: " " }))).toThrow(/prompt is required/);
});

test("parse fails the batch, not the line: a watcher half-listing its obligations reads as met", () => {
  expect(() => parse([line({ id: "pr-1", prompt: "p" }), "{ oh no"].join("\n"))).toThrow();
});
