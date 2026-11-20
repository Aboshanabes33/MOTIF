import test from "node:test";
import assert from "node:assert/strict";
import { probe } from "./probe.mjs";

function fixture(account, events = []) {
  let output = "";
  const calls = [];
  const rpc = {
    async call(method, p) {
      calls.push(method);
      switch (method) {
        case "initialize":
          return {};
        case "account/read":
          assert.equal(p.refreshToken, false);
          return { account };
        case "model/list":
          return p.cursor
            ? { data: [{ model: "test-2" }] }
            : { data: [{ model: "test-1" }], nextCursor: "second" };
        case "thread/start":
          assert.equal(p.ephemeral, true);
          return { model: p.model, modelProvider: p.modelProvider, thread: { id: "t" } };
        case "turn/start":
          return { turn: { id: "u" } };
        default:
          assert.fail();
      }
    },
    notify: () => {},
    event: () => {
      assert.ok(events.length);
      return events.shift();
    },
  };
  return {
    calls,
    output: () => output,
    run: (args) =>
      probe(args, rpc, (text) => {
        output += text;
      }),
  };
}
const account = { type: "chatgpt", email: "private@example.test" };
const delta = (s, turnId = "u") => ({
  method: "item/agentMessage/delta",
  params: { threadId: "t", turnId, delta: s },
});
const end = (status) => ({
  method: "turn/completed",
  params: { threadId: "t", turn: { id: "u", status } },
});
for (const state of [null, { type: "apiKey" }])
  test("refuses " + (state?.type ?? "signed out"), async () => {
    const f = fixture(state);
    assert.equal(await f.run(["--send", "test-1"]), 2);
    assert.deepEqual(f.calls, ["initialize", "account/read"]);
  });
test("status and listing never send prompts or print account details", async () => {
  for (const args of [[], ["--list"]]) {
    const f = fixture(account);
    assert.equal(await f.run(args), 0);
    assert.ok(!f.calls.includes("turn/start"));
    assert.ok(!f.output().includes(account.email));
    if (args.length) assert.match(f.output(), /test-1\ntest-2/);
  }
});
test("refuses a model absent from all pages", async () => {
  const f = fixture(account);
  assert.equal(await f.run(["--send", "unknown"]), 2);
  assert.ok(!f.calls.includes("thread/start"));
});
test("matches thread/turn, streams expected text, requires terminal success", async () => {
  const f = fixture(account, [
    delta("private", "other"),
    delta("PO"),
    delta("NG"),
    end("completed"),
  ]);
  assert.equal(await f.run(["--send", "test-2"]), 0);
  assert.match(f.output(), /PONG\nCompleted/);
  assert.ok(!f.output().includes("private"));
});
test("no success for failed turns, empty streams or arbitrary text", async () => {
  for (const events of [[delta("PONG"), end("failed")], [end("completed")], [delta("private")]]) {
    const f = fixture(account, events);
    await assert.rejects(f.run(["--send", "test-1"]));
    assert.doesNotMatch(f.output(), /Completed|private/);
  }
});
