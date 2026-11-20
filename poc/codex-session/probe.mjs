// Local diagnostic only. No MOTIF server, Pi vault, auth-file access, or credential import.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/;
const expected = "PONG";

export async function probe(args, rpc, write) {
  await rpc.call("initialize", {
    clientInfo: { name: "motif_local_probe", version: "0.1.0" },
    capabilities: {},
  });
  rpc.notify("initialized");
  const { account } = await rpc.call("account/read", { refreshToken: false });
  if (!account) {
    write("Not signed in. Run codex login locally, then retry.\n");
    return 2;
  }
  if (account.type !== "chatgpt") {
    write("Not a ChatGPT session; no request sent.\n");
    return 2;
  }
  write("Codex reports a cached ChatGPT session (not proof of inference).\n");
  if (!args.length) return 0;
  const models = new Set(),
    seen = new Set();
  let cursor;
  do {
    const page = await rpc.call("model/list", {
      modelProvider: "openai",
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    for (const entry of page.data)
      if (!entry.hidden && typeof entry.model === "string" && MODEL.test(entry.model))
        models.add(entry.model);
    cursor = page.nextCursor;
    if (cursor && (seen.has(cursor) || seen.size >= 50)) throw new Error();
    seen.add(cursor);
  } while (cursor);
  if (args[0] === "--list") {
    for (const m of models) write(m + "\n");
    return 0;
  }
  if (!models.has(args[1])) {
    write("Model not in the Codex list; no request sent.\n");
    return 2;
  }
  const thread = await rpc.call("thread/start", {
    ephemeral: true,
    model: args[1],
    modelProvider: "openai",
    sandbox: "read-only",
    approvalPolicy: "never",
  });
  if (thread.modelProvider !== "openai" || thread.model !== args[1]) throw new Error();
  const threadId = thread.thread.id;
  const { turn } = await rpc.call("turn/start", {
    threadId,
    input: [{ type: "text", text: "Reply with exactly PONG. Do not use tools." }],
  });
  let length = 0;
  for (;;) {
    const { method, params: p } = await rpc.event();
    if (p?.threadId !== threadId) continue;
    if (method === "item/agentMessage/delta" && p.turnId === turn.id) {
      // Never echo arbitrary model text, error bodies or terminal controls.
      if (typeof p.delta !== "string" || !expected.slice(length).startsWith(p.delta))
        throw new Error();
      length += p.delta.length;
      write(p.delta);
    }
    if (method === "turn/completed" && p.turn.id === turn.id) {
      if (p.turn.status !== "completed" || length !== expected.length) throw new Error();
      write("\nCompleted one Codex inference.\n");
      return 0;
    }
  }
}

async function main(args) {
  if (
    !(
      args.length === 0 ||
      (args.length === 1 && args[0] === "--list") ||
      (args.length === 2 && args[0] === "--send" && MODEL.test(args[1]))
    )
  ) {
    console.error("Usage: node probe.mjs [--list | --send MODEL]");
    return 2;
  }
  const cwd = await mkdtemp(join(tmpdir(), "motif-codex-probe-"));
  // Use the local user's Codex profile/keyring, but not inherited API keys or token overrides.
  const env = Object.fromEntries(
    [
      "PATH",
      "HOME",
      "USERPROFILE",
      "CODEX_HOME",
      "XDG_RUNTIME_DIR",
      "XDG_DATA_HOME",
      "XDG_CONFIG_HOME",
      "DBUS_SESSION_BUS_ADDRESS",
      "SystemRoot",
      "LOCALAPPDATA",
      "APPDATA",
      "TEMP",
      "TMP",
    ]
      .filter((k) => process.env[k])
      .map((k) => [k, process.env[k]]),
  );
  let child;
  try {
    child = spawn(
      "codex",
      ["-c", 'model_provider="openai"', "app-server", "--listen", "stdio://"],
      { cwd, env, stdio: ["pipe", "pipe", "ignore"], shell: false },
    );
    await new Promise((res, rej) => {
      child.once("error", rej);
      child.once("spawn", res);
    });
    const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    let sequence = 0;
    const queued = [];
    const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
    child.stdin.on("error", () => {}); // EOF is handled by read(); never dump protocol frames.
    async function read() {
      const { done, value } = await lines.next();
      if (done) throw new Error();
      const msg = JSON.parse(value);
      if (msg.method && msg.id !== undefined) throw new Error(); // no approvals, tools or token requests
      return msg;
    }
    const timer = setTimeout(() => child.kill("SIGKILL"), 90000);
    try {
      return await probe(
        args,
        {
          notify: (method) => send({ method }),
          async call(method, params) {
            const id = ++sequence;
            send({ id, method, params });
            for (;;) {
              const msg = await read();
              if (msg.id === id) {
                if (msg.error || !msg.result) throw new Error();
                return msg.result;
              }
              if (msg.method === "item/agentMessage/delta" || msg.method === "turn/completed")
                queued.push(msg);
            }
          },
          event: () => queued.shift() ?? read(),
        },
        (text) => process.stdout.write(text),
      );
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.error(
      error.code === "ENOENT"
        ? "Codex not found on PATH. Install the official CLI locally."
        : "Probe did not verify completion. Check Codex version, account, model and connectivity locally.",
    );
    return 1;
  } finally {
    child?.kill();
    await rm(cwd, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main(process.argv.slice(2));
