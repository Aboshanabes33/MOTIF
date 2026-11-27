import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTelemetry } from "../electron/telemetry.mjs";

const make = () =>
  createTelemetry({ userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "motif-tel-")), version: "0", platform: "linux", arch: "x64" });

test("telemetry is off by default", () => {
  assert.equal(make().status().enabled, false);
});

test("opt-in only sends the fixed anonymous payload", async () => {
  const sent = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return { ok: true };
  };
  try {
    const t = make();
    await t.start();
    assert.equal(sent.length, 0);
    assert.equal((await t.setEnabled(true)).enabled, true);
    assert.equal(sent.length, 1);
    const props = Object.keys(sent[0].body.properties).sort();
    assert.deepEqual(props, ["$process_person_profile", "app_version", "arch", "platform"]);
    await t.setEnabled(false);
    await t.start();
    assert.equal(sent.length, 1);
  } finally {
    globalThis.fetch = orig;
  }
});
