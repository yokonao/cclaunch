import { expect, test } from "bun:test";
import { command, names, shellQuote, workspaceName } from "./cmux.ts";
import { promptFile } from "./queue.ts";

test("shellQuote escapes single quotes", () => {
  expect(shellQuote("fix it")).toBe("'fix it'");
  expect(shellQuote("don't")).toBe("'don'\\''t'");
});

test("command reads the prompt from a file, never inlines it", () => {
  expect(command("abc")).toBe(`claude "$(cat ${shellQuote(promptFile("abc"))})"`);
});

test("names collects name/title at any depth", () => {
  const json = { workspaces: [{ name: "a", panes: [{ title: "b" }] }, { title: "c" }] };
  expect(names(json).sort()).toEqual(["a", "b", "c"]);
});

test("workspaceName", () => {
  expect(workspaceName("abc")).toBe("cclaunch-abc");
});
