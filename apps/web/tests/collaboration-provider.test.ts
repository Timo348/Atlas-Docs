import assert from "node:assert/strict";
import test from "node:test";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { Server } from "@hocuspocus/server";
import * as Y from "yjs";

type StoredDocuments = Map<string, Uint8Array>;

function createTestServer(storage: StoredDocuments) {
  return new Server({
    address: "127.0.0.1",
    port: 0,
    quiet: true,
    stopOnSignals: false,
    debounce: 5,
    maxDebounce: 20,
    async onAuthenticate({ token, connectionConfig }) {
      connectionConfig.readOnly = token === "readonly";
      return {};
    },
    async onLoadDocument({ documentName }) {
      return storage.get(documentName) || null;
    },
    async onStoreDocument({ documentName, document }) {
      storage.set(documentName, Y.encodeStateAsUpdate(document));
    },
  });
}

async function connect(
  url: string,
  name: string,
  document: Y.Doc,
  token = "read-write",
) {
  let provider: HocuspocusProvider | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    await new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(`Timed out syncing ${name}`)), 5_000);
      provider = new HocuspocusProvider({
        url,
        name,
        document,
        token,
        onSynced: ({ state }) => {
          if (state) resolve();
        },
        onAuthenticationFailed: ({ reason }) => reject(new Error(reason)),
      });
    });
    return provider;
  } catch (error) {
    provider?.destroy();
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitFor(check: () => boolean, message: string, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("multiple providers keep independent awareness, reconnect, and persist", { timeout: 30_000 }, async () => {
  const storage: StoredDocuments = new Map();
  const firstDocument = new Y.Doc();
  const secondDocument = new Y.Doc();
  let server: Server | null = createTestServer(storage);
  let first: HocuspocusProvider | null = null;
  let second: HocuspocusProvider | null = null;

  async function destroyServer() {
    const activeServer = server;
    if (!activeServer) return;
    await activeServer.destroy();
    if (server === activeServer) server = null;
  }

  try {
    await server.listen();
    let url = `ws://127.0.0.1:${server.address.port}`;
    first = await connect(url, "page:shared", firstDocument);
    second = await connect(url, "page:shared", secondDocument);

    first.setAwarenessField("user", { id: "same-user", name: "Alice", color: "#123456" });
    second.setAwarenessField("user", { id: "same-user", name: "Alice", color: "#123456" });
    await waitFor(
      () => Array.from(first.awareness?.getStates().values() || [])
        .filter((state) => state.user?.id === "same-user").length === 2,
      "two sessions of the same account did not remain independently visible",
    );

    const firstText = firstDocument.getText("markdown");
    const secondText = secondDocument.getText("markdown");
    firstText.insert(0, "LEFT");
    secondText.insert(0, "RIGHT");
    await waitFor(
      () => firstText.toString() === secondText.toString(),
      "concurrent provider edits did not converge",
    );
    assert.match(firstText.toString(), /LEFT/);
    assert.match(firstText.toString(), /RIGHT/);

    second.destroy();
    second = null;
    firstText.insert(firstText.length, "-ONLINE");
    secondText.insert(secondText.length, "-OFFLINE");
    second = await connect(url, "page:shared", secondDocument);
    await waitFor(
      () => firstText.toString() === secondText.toString(),
      "online and offline edits did not merge after reconnect",
    );
    assert.match(firstText.toString(), /-ONLINE/);
    assert.match(firstText.toString(), /-OFFLINE/);

    const readOnlyDocument = new Y.Doc();
    const observerDocument = new Y.Doc();
    let readOnly: HocuspocusProvider | null = null;
    let observer: HocuspocusProvider | null = null;
    try {
      readOnly = await connect(url, "page:shared", readOnlyDocument, "readonly");
      const accepted = firstText.toString();
      readOnlyDocument.getText("markdown").insert(0, "FORBIDDEN");

      // Messages on one connection are processed in order. A forced sync after
      // the forbidden update therefore acts as a server-side processing barrier.
      readOnly.synced = false;
      readOnly.forceSync();
      await waitFor(() => readOnly?.synced === true, "read-only verification sync did not complete");

      observer = await connect(url, "page:shared", observerDocument);
      const observerText = observerDocument.getText("markdown");
      assert.equal(observerText.toString(), accepted);

      // Prove the observer is read-write and that a later server update reached
      // both existing clients before asserting the forbidden text stayed local.
      const marker = "-READONLY-VERIFIED";
      observerText.insert(observerText.length, marker);
      await waitFor(
        () => firstText.toString().endsWith(marker) && secondText.toString().endsWith(marker),
        "read-write observer update did not reach the existing providers",
      );
      assert.equal(firstText.toString(), `${accepted}${marker}`);
      assert.equal(secondText.toString(), `${accepted}${marker}`);
      assert.equal(observerText.toString(), `${accepted}${marker}`);
    } finally {
      observer?.destroy();
      readOnly?.destroy();
      observerDocument.destroy();
      readOnlyDocument.destroy();
    }

    const persisted = firstText.toString();
    first.destroy();
    first = null;
    second.destroy();
    second = null;
    await destroyServer();
    await waitFor(() => storage.has("page:shared"), "server did not persist the document");

    server = createTestServer(storage);
    await server.listen();
    url = `ws://127.0.0.1:${server.address.port}`;
    const restoredDocument = new Y.Doc();
    let restored: HocuspocusProvider | null = null;
    try {
      restored = await connect(url, "page:shared", restoredDocument);
      assert.equal(restoredDocument.getText("markdown").toString(), persisted);
    } finally {
      restored?.destroy();
      restoredDocument.destroy();
    }
  } finally {
    first?.destroy();
    second?.destroy();
    firstDocument.destroy();
    secondDocument.destroy();
    await destroyServer();
  }
});
