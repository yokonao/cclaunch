import { homedir } from "node:os";
import { enqueue } from "./add.ts";
import * as config from "./config.ts";
import * as pick from "./pick.ts";

const CSS = `
:root {
  --bg: #f0eee6;
  --surface: #ffffff;
  --surface-2: #faf9f5;
  --ink: #1a1915;
  --muted: #6b6a63;
  --faint: #737166;
  --border: #e4e1d6;
  --border-strong: #d5d1c4;
  --accent: #b04e2e;
  --accent-hover: #973f22;
  --accent-soft: #f6ece6;
  --focus-ring: rgba(176,78,46,0.30);
  --danger: #b3452a;
  --serif: "Times New Roman", "Georgia", "Iowan Old Style", serif;
  --sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --mono: ui-monospace, "SF Mono", "Fira Code", "JetBrains Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1815;
    --surface: #242219;
    --surface-2: #2b2820;
    --ink: #ece8dd;
    --muted: #a29e91;
    --faint: #837f74;
    --border: #35322a;
    --border-strong: #464236;
    --accent: #d4744f;
    --accent-hover: #e59470;
    --accent-soft: #3a281f;
    --focus-ring: rgba(212,116,79,0.40);
    --danger: #e8846b;
  }
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--sans);
  background: var(--bg);
  color: var(--ink);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
header {
  border-bottom: 1px solid var(--border);
  padding: 16px 28px;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
header .mark {
  width: 15px; height: 15px; border-radius: 50%;
  background: var(--accent);
  align-self: center;
  flex: none;
  box-shadow: 0 0 0 4px var(--accent-soft);
}
header h1 {
  font-family: var(--serif);
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
header .sub { font-size: 0.8rem; color: var(--muted); }
.container { max-width: 720px; margin: 0 auto; padding: 48px 24px 80px; }
form {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
label {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
textarea, input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--ink);
  font-size: 0.92rem;
  font-family: var(--sans);
  transition: border-color 0.15s, box-shadow 0.15s;
}
textarea { min-height: 180px; resize: vertical; line-height: 1.6; }
input { font-family: var(--mono); font-size: 0.84rem; }
textarea::placeholder, input::placeholder { color: var(--faint); }
textarea:focus, input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--focus-ring);
}
.field { display: flex; flex-direction: column; gap: 6px; }
.hint { font-size: 0.75rem; color: var(--faint); }
.actions { display: flex; align-items: center; gap: 14px; }
button {
  padding: 10px 22px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font-size: 0.9rem;
  font-family: var(--sans);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s;
}
button:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
kbd {
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--muted);
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  padding: 1px 5px;
}
.flash {
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 10px;
  background: var(--surface);
  padding: 14px 18px;
  margin-bottom: 20px;
  font-size: 0.88rem;
}
.flash.err { border-left-color: var(--danger); color: var(--danger); white-space: pre-wrap; }
.flash .path { font-family: var(--mono); font-size: 0.82rem; color: var(--muted); }
.combo { position: relative; }
.combo ul {
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  z-index: 10;
  max-height: 260px;
  overflow-y: auto;
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.10);
}
.combo ul[hidden] { display: none; }
.combo li {
  padding: 7px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.combo li[aria-selected="true"] { background: var(--accent-soft); }
.combo li .name { font-size: 0.88rem; font-weight: 600; }
.combo li .parent {
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--faint);
  overflow-wrap: anywhere;
}
`;

const escape = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

// `</script>` inside a path would end the tag early.
const json = (v: unknown): string => JSON.stringify(v).replace(/</g, "\\u003c");

function page(flash: string, dirs: string[], home: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>cclaunch</title>
<style>${CSS}</style>
<header>
  <span class="mark"></span>
  <h1>cclaunch</h1>
  <span class="sub">queue a task, cmux launches it</span>
</header>
<div class="container">
  ${flash}
  <form method="post" action="/">
    <div class="field">
      <label for="prompt">Prompt</label>
      <textarea id="prompt" name="prompt" autofocus placeholder="What should Claude do?"></textarea>
    </div>
    <div class="field combo">
      <label for="cwd">Directory</label>
      <input id="cwd" name="cwd" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="dirs"
             placeholder="leave empty and Claude picks one">
      <ul id="dirs" role="listbox" hidden></ul>
    </div>
    <div class="actions">
      <button type="submit">Queue</button>
      <span class="hint"><kbd>⌘</kbd> + <kbd>Enter</kbd> to submit</span>
    </div>
  </form>
</div>
<script>
document.querySelector('textarea').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') e.target.form.requestSubmit();
});

const DIRS = ${json(dirs)};
const HOME = ${json(home)};
const input = document.getElementById('cwd');
const list = document.getElementById('dirs');
let active = -1;

// The full path is what gets submitted, but it is too long to read; show the
// repo name first and the parent, home-abbreviated, underneath.
const render = () => {
  const q = input.value.trim().toLowerCase();
  const hits = DIRS.filter((d) => d.toLowerCase().includes(q)).slice(0, 50);
  active = -1;
  list.replaceChildren(...hits.map((d, i) => {
    const short = HOME && d.startsWith(HOME + '/') ? '~' + d.slice(HOME.length) : d;
    const cut = short.lastIndexOf('/');
    const li = document.createElement('li');
    li.role = 'option';
    li.dataset.path = d;
    li.dataset.i = i;
    li.innerHTML = '<span class="name"></span><span class="parent"></span>';
    li.querySelector('.name').textContent = short.slice(cut + 1);
    li.querySelector('.parent').textContent = short.slice(0, cut) || '/';
    return li;
  }));
  open(hits.length > 0);
};

const open = (yes) => {
  list.hidden = !yes;
  input.setAttribute('aria-expanded', String(yes));
};

const highlight = (i) => {
  const items = [...list.children];
  if (!items.length) return;
  active = (i + items.length) % items.length;
  items.forEach((li, n) => li.setAttribute('aria-selected', String(n === active)));
  items[active].scrollIntoView({ block: 'nearest' });
};

const choose = (li) => {
  input.value = li.dataset.path;
  open(false);
};

input.addEventListener('input', render);
input.addEventListener('focus', render);
input.addEventListener('blur', () => setTimeout(() => open(false), 120));
input.addEventListener('keydown', (e) => {
  if (list.hidden) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
  else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(list.children[active]); }
  else if (e.key === 'Escape') open(false);
});
list.addEventListener('mousedown', (e) => {
  const li = e.target.closest('li');
  if (li) choose(li);
});
</script>`;
}

const html = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

export function serve(port: number, log: (...args: unknown[]) => void): void {
  const home = homedir();
  const dirs = (): string[] => {
    try {
      return pick.candidates(config.config());
    } catch {
      return [];
    }
  };

  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: async (req) => {
      const { pathname } = new URL(req.url);
      if (pathname !== "/") return new Response("not found", { status: 404 });
      if (req.method === "GET") return html(page("", dirs(), home));
      if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

      const form = await req.formData();
      try {
        const task = await enqueue(String(form.get("prompt") ?? ""), String(form.get("cwd") ?? ""));
        log(`queued ${task.id}  ${task.cwd}  ${task.prompt.split("\n")[0]}`);
        const flash = `<div class="flash">Queued <strong>${escape(task.id)}</strong><div class="path">${escape(task.cwd)}</div></div>`;
        return html(page(flash, dirs(), home));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return html(page(`<div class="flash err">${escape(msg)}</div>`, dirs(), home), 400);
      }
    },
  });
  log(`web on http://127.0.0.1:${server.port}`);
}
