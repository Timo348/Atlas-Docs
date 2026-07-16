import assert from "node:assert/strict";
import test from "node:test";
import { resolveCollaborationUrl } from "../src/lib/runtime-config";

test("uses an explicitly configured collaboration URL", () => {
  assert.equal(resolveCollaborationUrl({
    configuredUrl: "wss://docs.example.com/live/",
    host: "192.168.1.42:30002",
  }), "wss://docs.example.com/live");
});

test("derives the offline-safe URL from the browser-facing request host", () => {
  assert.equal(resolveCollaborationUrl({
    host: "192.168.1.42:30002",
    requestProtocol: "http:",
  }), "ws://192.168.1.42:30003");
});

test("uses forwarded host and protocol behind a reverse proxy", () => {
  assert.equal(resolveCollaborationUrl({
    forwardedHost: "docs.intranet.example, proxy:3000",
    host: "web:3000",
    forwardedProtocol: "https, http",
    requestProtocol: "http:",
    publicPort: "443",
  }), "wss://docs.intranet.example");
});

test("supports IPv6 server addresses", () => {
  assert.equal(resolveCollaborationUrl({
    host: "[fd00::42]:30002",
    requestProtocol: "http:",
    publicPort: "30003",
  }), "ws://[fd00::42]:30003");
});

test("rejects invalid explicit URLs and ports", () => {
  assert.throws(
    () => resolveCollaborationUrl({ configuredUrl: "https://docs.example.com" }),
    /ws:\/\/ or wss:\/\//,
  );
  assert.throws(
    () => resolveCollaborationUrl({ host: "docs.example.com", publicPort: "70000" }),
    /valid TCP port/,
  );
});
