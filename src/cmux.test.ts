import { expect, test } from "bun:test";
import { names, shellQuote, workspaceName } from "./cmux.ts";

test("shellQuote escapes single quotes", () => {
  expect(shellQuote("fix it")).toBe("'fix it'");
  expect(shellQuote("don't")).toBe("'don'\\''t'");
});

test("names collects name/title at any depth", () => {
  const json = { workspaces: [{ name: "a", panes: [{ title: "b" }] }, { title: "c" }] };
  expect(names(json).sort()).toEqual(["a", "b", "c"]);
});

test("workspaceName", () => {
  expect(workspaceName("abc")).toBe("cclaunch-abc");
});
