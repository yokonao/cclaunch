import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const workspaceName = (id) => `cclaunch-${id}`;

// `--command` is typed into the workspace's shell, so the prompt needs quoting.
const shellQuote = (s) => `'${s.replaceAll("'", `'\\''`)}'`;

// Shape-agnostic: cmux's JSON nests workspaces, and the name field has been
// spelled both `name` and `title`. Matching on a wrong shape would silently
// drop a task, so collect every candidate rather than assume a layout.
function names(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) names(child, out);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if ((key === "name" || key === "title") && typeof value === "string") out.push(value);
      else names(value, out);
    }
  }
  return out;
}

export async function hasWorkspace(name) {
  const { stdout } = await run("cmux", ["workspace", "list", "--json"]);
  return names(JSON.parse(stdout)).includes(name);
}

export async function launch({ id, cwd, prompt }) {
  await run("cmux", [
    "new-workspace",
    "--name",
    workspaceName(id),
    "--cwd",
    cwd,
    "--command",
    `claude ${shellQuote(prompt)}`,
  ]);
}

export const _test = { shellQuote, names };
