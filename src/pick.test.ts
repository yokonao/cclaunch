import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidates, validate } from "./pick.ts";

function tree(...dirs: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "cclaunch-"));
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true });
  return root;
}

test("candidates stops at .git and respects depth", () => {
  const root = tree("a/.git", "a/nested/.git", "b/c/.git", "deep/1/2/3/.git", ".hidden/.git");
  expect(candidates({ roots: [root], depth: 2 })).toEqual([join(root, "a"), join(root, "b", "c")]);
});

test("candidates ignores missing roots", () => {
  expect(candidates({ roots: ["/no/such/place"], depth: 4 })).toEqual([]);
});

test("validate accepts only a listed path", () => {
  const dirs = ["/src/foo", "/src/bar"];
  expect(validate("/src/foo\n", dirs)).toBe("/src/foo");
  expect(validate("Sure! Here you go:\n/src/bar", dirs)).toBe("/src/bar");
  expect(validate("/src/baz", dirs)).toBeUndefined();
  expect(validate("NONE", dirs)).toBeUndefined();
});
