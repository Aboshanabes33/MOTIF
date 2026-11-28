import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startMotifServer } from "../server/motif-server.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "motif-api-test-"));
}

test("MOTIF HTTP API: Brands prefs.json CRUD, validation, Projects, Footage, Voice Notes, Search & Releases", async () => {
  const tmpDir = makeTempDir();
  const srv = await startMotifServer({
    host: "127.0.0.1",
    port: 0,
    dataDir: tmpDir,
    cleanInit: true,
  });

  try {
    const base = srv.url;

    // 1. Health & Info
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert.equal(health.ok, true);
    assert.equal(health.app, "MOTIF");

    const info = await fetch(`${base}/api/info`).then((r) => r.json());
    const initialPrefs = await fetch(`${base}/api/prefs`).then((r) => r.json());
    assert.equal(initialPrefs.onboardingCompleted, false);
    assert.equal(initialPrefs.telemetryEnabled, true);
    assert.equal(info.mcp.ready, true);
    assert.ok(info.mcp.toolCount >= 16);

    // 2. Reject empty brand name
    const badName = await fetch(`${base}/api/brands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    assert.equal(badName.status, 400);

    // 3. Reject oversized logo (> 2 MB)
    const hugeBase64 = "A".repeat(3 * 1024 * 1024);
    const badLogo = await fetch(`${base}/api/brands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Big Logo Brand",
        logo: `data:image/png;base64,${hugeBase64}`,
      }),
    });
    assert.equal(badLogo.status, 400);

    // 4. Create valid brand with Arabic + English name, colors normalized & capped at 4
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const createdRes = await fetch(`${base}/api/brands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Qafila · قافلة",
        tagline: "Editorial Arabic studio",
        logo: tinyPng,
        colors: ["#2F7268", "#9fd8cd", "#f2b880", "#0c2729", "#ffffff"],
        audience: "Founders & filmmakers",
        voice: "Calm, crisp, insightful",
        channels: "YouTube, Reels",
        notes: "Always keep dark teal cards",
      }),
    });
    assert.equal(createdRes.status, 201);
    const created = await createdRes.json();
    assert.equal(created.brand.colors.length, 4);
    assert.equal(created.brand.colors[0], "#2f7268");
    assert.equal(created.brand.logo, tinyPng);

    // Verify canonical prefs.json persistence via GET /api/prefs
    const prefs = await fetch(`${base}/api/prefs`).then((r) => r.json());
    assert.equal(prefs.brands.length, 1);
    assert.equal(prefs.brands[0].id, created.brand.id);

    // 5. PUT /api/prefs also persists safely
    const putPrefs = await fetch(`${base}/api/prefs`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang: "ar", POSTHOG_API_KEY: "should-never-be-persisted", SENTRY_DSN: "https://secret.invalid/1" }),
    });
    assert.equal(putPrefs.status, 200);
    const afterPut = await putPrefs.json();
    assert.equal(afterPut.lang, "ar");
    assert.equal(afterPut.brands.length, 1);
    assert.equal(afterPut.POSTHOG_API_KEY, undefined);
    assert.equal(afterPut.SENTRY_DSN, undefined);
    const prefsDisk = fs.readFileSync(path.join(tmpDir, "home", "prefs.json"), "utf8");
    assert.doesNotMatch(prefsDisk, /should-never-be-persisted|secret\\.invalid/);

    // 6. Create Project linked to Brand & update progress
    const projRes = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Launch Cut",
        brandId: created.brand.id,
        aspect: "16:9",
        summary: "Hero launch walkthrough",
      }),
    });
    assert.equal(projRes.status, 201);
    const { project } = await projRes.json();
    assert.equal(project.brandId, created.brand.id);

    const patched = await fetch(`${base}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "rendering", progress: 72 }),
    }).then((r) => r.json());
    assert.equal(patched.project.progress, 72);
    const savedEdit = await fetch(`${base}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aiEdit: { ...project.aiEdit, captions: ["Saved caption"] } }),
    }).then((r) => r.json());
    assert.equal(savedEdit.project.aiEdit.captions[0], "Saved caption");

    // 7. Create Voice Note with audio payload & stream back
    const fakeWav = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
    const vnRes = await fetch(`${base}/api/voice-notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Opening direction",
        transcript: "Use Qafila mint highlight at 0:04",
        durationSec: 12,
        brandId: created.brand.id,
        projectId: project.id,
        audioBase64: fakeWav,
      }),
    });
    assert.equal(vnRes.status, 201);
    const { voiceNote } = await vnRes.json();
    assert.equal(voiceNote.hasAudio, true);

    const audioResp = await fetch(`${base}/api/voice-notes/${voiceNote.id}/audio`);
    assert.equal(audioResp.status, 200);
    assert.equal(audioResp.headers.get("content-type"), "audio/wav");

    // 8. Unified Search (Arabic + English)
    const searchAr = await fetch(`${base}/api/search?q=${encodeURIComponent("قافلة")}`).then((r) => r.json());
    assert.equal(searchAr.brands.length, 1);
    assert.equal(searchAr.projects.length, 1);

    // 9. MCP HTTP Inspector endpoint
    const mcpInvoke = await fetch(`${base}/api/mcp/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "list_brands", arguments: {} }),
    }).then((r) => r.json());
    assert.equal(mcpInvoke.ok, true);
    assert.equal(mcpInvoke.result.count, 1);
    assert.equal(mcpInvoke.result.brands[0].name, "Qafila · قافلة");

    // 10. Releases endpoint
    const releases = await fetch(`${base}/api/releases`).then((r) => r.json());
    assert.equal(releases.current.version, "2.1.1");
    assert.ok(releases.current.artifacts.length >= 2);

    // Agent-generated edit metadata and HyperFrames composition contract.
    assert.equal(project.aiEdit.engine, "remotion");
    assert.ok(project.aiEdit.scenes.length > 0);
    const hyperframes = await fetch(`${base}/api/projects/${project.id}/hyperframes/index.html`).then((r) => r.text());
    assert.match(hyperframes, /data-composition-id="main"/);
    assert.match(hyperframes, /window\.__timelines\.main=tl/);
    assert.match(hyperframes, /data-track-index="0"/);
    const gsap = await fetch(`${base}/api/vendor/gsap.js`);
    assert.equal(gsap.status, 200);
    assert.match(await gsap.text(), /GreenSock|gsap/);

    const telemetryConfig = await fetch(`${base}/api/telemetry/config`).then((r) => r.json());
    assert.equal(typeof telemetryConfig.posthogConfigured, "boolean");
    const telemetryPost = await fetch(`${base}/api/telemetry/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "test", properties: { harmless: true } }) });
    assert.equal(telemetryPost.status, 202);
    assert.equal(typeof (await telemetryPost.json()).accepted, "boolean");
    const diagnostics = await fetch(`${base}/api/telemetry/diagnostics`).then((r) => r.json());
    assert.ok(Array.isArray(diagnostics));
    const updateCheck = await fetch(`${base}/api/updates/check`).then((r) => r.json());
    assert.equal(updateCheck.currentVersion, "2.1.1");
    assert.equal(typeof updateCheck.updateAvailable, "boolean");
  } finally {
    await srv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
