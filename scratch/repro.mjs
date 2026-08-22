// Scratch reproduction: load the DSH web GUI in headless Chrome via CDP,
// watch console + network for the deepseekBalance RPC, and sample the dock DOM.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://127.0.0.1:3080/";
const WAIT_MS = Number(process.env.WAIT_MS ?? 20000);
const CDP_PORT = Number(process.env.CDP_PORT ?? 9333); // fixed port: we read the ws url over HTTP, no piped stdio

// Sandbox: keep all Chrome artifacts inside the workspace.
const userDataDir = mkdtempSync(join(process.cwd(), "scratch", "chrome-profile-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Poll the CDP version endpoint until Chrome is up.
let wsUrl = null;
for (let i = 0; i < 50; i++) {
  try {
    const ver = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    const j = await ver.json();
    wsUrl = j.webSocketDebuggerUrl;
    break;
  } catch {
    await sleep(300);
  }
}
if (!wsUrl) { console.error("chrome CDP not reachable"); process.exit(1); }
console.log("CDP:", wsUrl);

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id !== undefined) {
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
  }
};

// Create a dedicated tab for the GUI.
const tab = await send("Target.createTarget", { url: "about:blank" });
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
const target = list.find((t) => t.id === tab.targetId);
const tabWs = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { tabWs.onopen = res; tabWs.onerror = rej; });
let tseq = 0;
const tpending = new Map();
const tevents = [];
function tsend(method, params = {}) {
  const id = ++tseq;
  tabWs.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    tpending.set(id, { resolve, reject });
  });
}
tabWs.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id !== undefined) {
    const p = tpending.get(msg.id);
    if (p) { tpending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
  } else if (msg.method) {
    tevents.push(msg);
  }
};

await tsend("Runtime.enable");
await tsend("Log.enable");
await tsend("Network.enable");
await tsend("Page.enable");

const started = Date.now();
await tsend("Page.navigate", { url: URL });

// Sample the dock DOM periodically.
let lastDock = null;
for (let i = 0; i < WAIT_MS / 2000; i++) {
  await sleep(2000);
  const res = await tsend("Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector('[data-plugin="deepseek-balance"]');
      if (!el) return "NO-DOCK";
      return el.textContent;
    })()`,
    returnByValue: true,
  });
  const text = res.result?.value ?? "(eval failed)";
  if (text !== lastDock) { lastDock = text; console.log(`[${Date.now() - started}ms] dock: ${text}`); }
}

console.log("\n--- network (api requests) ---");
for (const e of tevents) {
  if (e.method === "Network.requestWillBeSent") {
    const req = e.params.request;
    if (req.url.includes("/api/")) console.log("REQ", req.method, req.url.slice(req.url.indexOf("/api/")));
  }
  if (e.method === "Network.responseReceived") {
    const r = e.params.response;
    if (r.url.includes("/api/")) console.log("RES", r.status, r.url.slice(r.url.indexOf("/api/")), `${r.timing ? Math.round(r.timing.receiveHeadersEnd - r.timing.requestTime * 1000) : "?"}ms`);
  }
}

console.log("\n--- exceptions / console / logs ---");
for (const e of tevents) {
  if (e.method === "Runtime.exceptionThrown") {
    const d = e.params.exceptionDetails;
    console.log("EXCEPTION:", d.exception?.description ?? d.text, "at", d.url ?? "");
  }
  if (e.method === "Runtime.consoleAPICalled") {
    const args = (e.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (/deepseek|balance|查询|余额|error|fail/i.test(args)) console.log("CONSOLE:", e.params.type, args.slice(0, 300));
  }
  if (e.method === "Log.entryAdded" && /error|warn/i.test(e.params.entry.level)) {
    console.log("LOG:", e.params.entry.level, String(e.params.entry.text).slice(0, 300));
  }
}

ws.close();
tabWs.close();
chrome.kill();
rmSync(userDataDir, { recursive: true, force: true });
process.exit(0);
