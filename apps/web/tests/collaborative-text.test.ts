import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import {
  CollaborativeTextBinding,
  createCollaborativeCursor,
  createCollaborativeTableCursor,
  createCollaborativeTextCursor,
  distinctCollaborativeUsers,
  parseCollaborativePresenceStates,
  resolveCollaborativeCursor,
} from "../src/lib/collaborative-text";

const TEXT_NAME = "markdown";

function docWithText(value: string, clientId?: number) {
  const document = new Y.Doc();
  if (clientId !== undefined) document.clientID = clientId;
  document.getText(TEXT_NAME).insert(0, value);
  return document;
}

function cloneDocument(source: Y.Doc, clientId?: number) {
  const document = new Y.Doc();
  if (clientId !== undefined) document.clientID = clientId;
  Y.applyUpdate(document, Y.encodeStateAsUpdate(source));
  return document;
}

function updateMissingIn(source: Y.Doc, target: Y.Doc) {
  return Y.encodeStateAsUpdate(source, Y.encodeStateVector(target));
}

function syncOneWay(source: Y.Doc, target: Y.Doc) {
  Y.applyUpdate(target, updateMissingIn(source, target));
}

function text(document: Y.Doc) {
  return document.getText(TEXT_NAME).toString();
}

function assertSameState(left: Y.Doc, right: Y.Doc) {
  assert.deepEqual(
    Array.from(Y.encodeStateVector(left)),
    Array.from(Y.encodeStateVector(right)),
  );
}

test("a stale DOM insert preserves a remote insert already present in live state", () => {
  const live = docWithText("abc", 1);
  const remote = cloneDocument(live, 2);
  const binding = new CollaborativeTextBinding(live, TEXT_NAME);
  binding.viewDocument.clientID = 3;

  remote.getText(TEXT_NAME).insert(0, "X");
  syncOneWay(remote, live);
  assert.equal(text(live), "Xabc");
  assert.equal(binding.value, "abc");

  binding.apply("Yabc", "local-input");
  assert.equal(binding.value, "Yabc");
  assert.match(text(live), /^[XY]{2}abc$/);
  assert.equal(new Set(text(live).slice(0, 2)).size, 2);

  binding.sync();
  assert.equal(binding.value, text(live));
  binding.destroy();
  live.destroy();
  remote.destroy();
});

test("concurrent inserts at different positions converge without overwriting", () => {
  const seed = docWithText("abcd", 10);
  const left = cloneDocument(seed, 11);
  const right = cloneDocument(seed, 12);
  const leftBinding = new CollaborativeTextBinding(left, TEXT_NAME);
  const rightBinding = new CollaborativeTextBinding(right, TEXT_NAME);
  leftBinding.viewDocument.clientID = 21;
  rightBinding.viewDocument.clientID = 22;

  leftBinding.apply("aXbcd");
  rightBinding.apply("abcYd");
  syncOneWay(left, right);
  syncOneWay(right, left);
  leftBinding.sync();
  rightBinding.sync();

  assert.equal(text(left), "aXbcYd");
  assert.equal(text(right), text(left));
  assert.equal(leftBinding.value, text(left));
  assert.equal(rightBinding.value, text(left));

  leftBinding.destroy();
  rightBinding.destroy();
  seed.destroy();
  left.destroy();
  right.destroy();
});

test("concurrent inserts at the same position retain every author's text", () => {
  const seed = docWithText("abcd", 30);
  const left = cloneDocument(seed, 31);
  const right = cloneDocument(seed, 32);
  const observer = cloneDocument(seed, 33);
  const leftBinding = new CollaborativeTextBinding(left, TEXT_NAME);
  const rightBinding = new CollaborativeTextBinding(right, TEXT_NAME);
  leftBinding.viewDocument.clientID = 41;
  rightBinding.viewDocument.clientID = 42;

  const leftUpdate = leftBinding.apply("abXcd");
  const rightUpdate = rightBinding.apply("abYcd");
  assert.ok(leftUpdate && rightUpdate);
  Y.applyUpdate(observer, rightUpdate);
  Y.applyUpdate(observer, leftUpdate);
  Y.applyUpdate(left, rightUpdate);
  Y.applyUpdate(right, leftUpdate);

  assert.equal(text(left), text(right));
  assert.equal(text(observer), text(left));
  assert.match(text(left), /^ab[XY]{2}cd$/);
  assert.equal(new Set(text(left).slice(2, 4)).size, 2);

  leftBinding.destroy();
  rightBinding.destroy();
  seed.destroy();
  left.destroy();
  right.destroy();
  observer.destroy();
});

test("a stale delete does not delete an unseen concurrent insert", () => {
  const live = docWithText("abc", 50);
  const remote = cloneDocument(live, 51);
  const binding = new CollaborativeTextBinding(live, TEXT_NAME);
  binding.viewDocument.clientID = 52;

  remote.getText(TEXT_NAME).insert(1, "X");
  syncOneWay(remote, live);
  assert.equal(text(live), "aXbc");

  binding.apply("ac");
  assert.equal(binding.value, "ac");
  assert.equal(text(live), "aXc");
  binding.sync();
  assert.equal(binding.value, "aXc");

  binding.destroy();
  live.destroy();
  remote.destroy();
});

test("independent source changes do not rewrite content between their ranges", () => {
  const live = docWithText("| A | B |\n| --- | --- |\n| x | y |", 53);
  const remote = cloneDocument(live, 54);
  const binding = new CollaborativeTextBinding(live, TEXT_NAME);
  binding.viewDocument.clientID = 55;

  remote.getText(TEXT_NAME).insert(6, "REMOTE");
  syncOneWay(remote, live);
  binding.applyChanges([
    { start: 4, end: 4, value: "|  " },
    { start: 18, end: 18, value: "| --- " },
    { start: 32, end: 32, value: "|  " },
  ]);

  assert.match(text(live), /REMOTE/);
  assert.equal(text(live).split("\n").length, 3);
  binding.sync();
  assert.equal(binding.value, text(live));

  binding.destroy();
  live.destroy();
  remote.destroy();
});

test("incremental updates converge in every order and remain idempotent", () => {
  const seed = docWithText("----", 60);
  const documents = [61, 62, 63].map((clientId) => cloneDocument(seed, clientId));
  const bindings = documents.map((document, index) => {
    const binding = new CollaborativeTextBinding(document, TEXT_NAME);
    binding.viewDocument.clientID = 70 + index;
    return binding;
  });
  const updates = [
    bindings[0].apply("A----"),
    bindings[1].apply("--B--"),
    bindings[2].apply("----C"),
  ];
  assert.ok(updates.every((update) => update !== null));
  const concreteUpdates = updates as Uint8Array[];
  const orders = [
    [0, 1, 2],
    [2, 1, 0],
    [1, 2, 0],
    [2, 0, 1],
  ];
  const results = orders.map((order, resultIndex) => {
    const result = cloneDocument(seed, 80 + resultIndex);
    for (const updateIndex of order) {
      Y.applyUpdate(result, concreteUpdates[updateIndex]);
      Y.applyUpdate(result, concreteUpdates[updateIndex]);
    }
    return result;
  });

  for (const result of results) assert.equal(text(result), "A--B--C");
  for (const result of results.slice(1)) assertSameState(results[0], result);

  bindings.forEach((binding) => binding.destroy());
  documents.forEach((document) => document.destroy());
  results.forEach((document) => document.destroy());
  seed.destroy();
});

test("sync imports same-string structural updates and is idempotent", () => {
  const live = docWithText("same", 90);
  const remote = cloneDocument(live, 91);
  const binding = new CollaborativeTextBinding(live, TEXT_NAME);
  binding.viewDocument.clientID = 92;
  const beforeRemote = Y.encodeStateVector(live);

  remote.transact(() => {
    remote.getText(TEXT_NAME).insert(2, "x");
    remote.getText(TEXT_NAME).delete(2, 1);
  });
  Y.applyUpdate(live, Y.encodeStateAsUpdate(remote, beforeRemote));
  assert.equal(text(live), "same");
  assert.notDeepEqual(
    Array.from(Y.encodeStateVector(binding.viewDocument)),
    Array.from(Y.encodeStateVector(live)),
  );

  binding.sync();
  assert.equal(binding.value, "same");
  assertSameState(binding.viewDocument, live);
  const vectorAfterFirstSync = Array.from(Y.encodeStateVector(binding.viewDocument));
  binding.sync();
  assert.deepEqual(Array.from(Y.encodeStateVector(binding.viewDocument)), vectorAfterFirstSync);

  binding.destroy();
  live.destroy();
  remote.destroy();
});

test("relative anchor and head follow inserts and deletes", () => {
  const document = docWithText("abcdef", 100);
  const payload = createCollaborativeCursor(document, TEXT_NAME, 2, 5);
  assert.equal(payload.index, 5, "legacy index represents HEAD, not anchor");
  assert.deepEqual(resolveCollaborativeCursor(payload, document, TEXT_NAME), {
    anchor: 2,
    head: 5,
    index: 5,
  });

  document.getText(TEXT_NAME).insert(0, "XX");
  document.getText(TEXT_NAME).delete(3, 1); // delete the original b
  assert.equal(text(document), "XXacdef");
  assert.deepEqual(resolveCollaborativeCursor(payload, document, TEXT_NAME), {
    anchor: 3,
    head: 6,
    index: 6,
  });

  document.getText(TEXT_NAME).delete(3, 3); // delete cde, including anchor's item
  assert.equal(text(document), "XXaf");
  assert.deepEqual(resolveCollaborativeCursor(payload, document, TEXT_NAME), {
    anchor: 3,
    head: 3,
    index: 3,
  });
  document.destroy();
});

test("table-cell cursor context remains stable at an end boundary", () => {
  const document = docWithText("before\nA|B\n---|---\nx|y", 105);
  const tableStart = "before\n".length;
  const cursor = createCollaborativeTableCursor(
    document,
    TEXT_NAME,
    tableStart,
    1,
    1,
    document.getText(TEXT_NAME).length,
  );
  const transported = JSON.parse(JSON.stringify(cursor)) as unknown;

  document.getText(TEXT_NAME).insert(0, "prefix\n");
  const resolved = resolveCollaborativeCursor(transported, document, TEXT_NAME);
  assert.deepEqual(resolved, {
    anchor: document.getText(TEXT_NAME).length,
    head: document.getText(TEXT_NAME).length,
    index: document.getText(TEXT_NAME).length,
    surface: {
      kind: "table-cell",
      tableStart: tableStart + "prefix\n".length,
      row: 1,
      column: 1,
    },
  });
  document.destroy();
});

test("text cursor context disambiguates a table-start boundary", () => {
  const document = docWithText("before\n| A | B |\n| --- | --- |", 106);
  const boundary = "before\n".length;
  const cursor = createCollaborativeTextCursor(document, TEXT_NAME, boundary);
  const transported = JSON.parse(JSON.stringify(cursor)) as unknown;
  assert.deepEqual(resolveCollaborativeCursor(transported, document, TEXT_NAME), {
    anchor: boundary,
    head: boundary,
    index: boundary,
    surface: { kind: "text" },
  });
  document.destroy();
});

test("cursor resolution supports legacy payloads and rejects malformed awareness data", () => {
  const document = docWithText("hello", 110);
  assert.deepEqual(resolveCollaborativeCursor({ index: 999 }, document, TEXT_NAME), {
    anchor: 5,
    head: 5,
    index: 5,
  });
  assert.deepEqual(resolveCollaborativeCursor({ anchor: [999], head: "bad", index: 3 }, document, TEXT_NAME), {
    anchor: 3,
    head: 3,
    index: 3,
  });

  const malformed: unknown[] = [
    null,
    "cursor",
    {},
    { index: -1 },
    { index: Number.NaN },
    { anchor: [], head: [] },
    { anchor: [0, 1.5], head: [0], index: "2" },
    { anchor: new Array(5000).fill(0), head: [0] },
  ];
  for (const value of malformed) {
    assert.doesNotThrow(() => resolveCollaborativeCursor(value, document, TEXT_NAME));
    assert.equal(resolveCollaborativeCursor(value, document, TEXT_NAME), null);
  }

  const otherText = document.getText("other");
  otherText.insert(0, "other");
  const wrongTypeCursor = createCollaborativeCursor(document, "other", 2);
  assert.deepEqual(resolveCollaborativeCursor(wrongTypeCursor, document, TEXT_NAME), {
    anchor: 2,
    head: 2,
    index: 2,
  });
  wrongTypeCursor.index = 4;
  assert.deepEqual(resolveCollaborativeCursor(wrongTypeCursor, document, TEXT_NAME), {
    anchor: 4,
    head: 4,
    index: 4,
  });
  document.destroy();
});

test("cursor payload is JSON-safe and resolves against both view and live documents", () => {
  const live = docWithText("selection", 120);
  const binding = new CollaborativeTextBinding(live, TEXT_NAME);
  binding.viewDocument.clientID = 121;
  binding.apply("select-ion");
  const cursor = createCollaborativeCursor(binding.viewDocument, TEXT_NAME, 2, 7);
  const transported = JSON.parse(JSON.stringify(cursor)) as unknown;

  assert.deepEqual(
    resolveCollaborativeCursor(transported, binding.viewDocument, TEXT_NAME),
    { anchor: 2, head: 7, index: 7 },
  );
  assert.deepEqual(
    resolveCollaborativeCursor(transported, live, TEXT_NAME),
    { anchor: 2, head: 7, index: 7 },
  );

  binding.destroy();
  live.destroy();
});

test("presence parsing keeps sessions by clientId while user summaries are distinct", () => {
  const document = docWithText("presence", 130);
  const cursor = createCollaborativeCursor(document, TEXT_NAME, 2, 4);
  const sharedUser = {
    id: "user-1",
    name: "Ada",
    color: "#123456",
    hasAvatar: true,
    avatarVersion: 7,
  };
  const states: unknown[] = [
    { clientId: 10, user: sharedUser, cursor },
    { clientId: 11, user: sharedUser, cursor: { index: 999 } },
    { clientId: 11, user: sharedUser, cursor: { index: 5 } }, // latest state for this session
    { clientId: -1, user: sharedUser, cursor },
    { clientId: 12, user: { id: "broken" }, cursor },
    { clientId: 13, user: sharedUser, cursor: { anchor: [999], head: null } },
  ];
  const presences = parseCollaborativePresenceStates(states, document, TEXT_NAME);

  assert.equal(presences.length, 3);
  assert.deepEqual(presences.map((presence) => presence.clientId), [10, 11, 13]);
  assert.deepEqual(presences[1].cursor, { anchor: 5, head: 5, index: 5 });
  assert.equal(presences[2].cursor, null);
  assert.equal(distinctCollaborativeUsers(presences).length, 1);

  const mapEntries = new Map([[14, {
    clientId: 10,
    user: sharedUser,
    cursor: { index: 1 },
  }]]);
  assert.deepEqual(
    parseCollaborativePresenceStates(mapEntries, document, TEXT_NAME).map((presence) => presence.clientId),
    [14],
    "the trusted Awareness map key must override a spoofed clientId field",
  );
  document.destroy();
});

test("Unicode, emoji replacements, and CRLF edits stay byte-safe", () => {
  const live = docWithText("A😀\r\nB", 140);
  const binding = new CollaborativeTextBinding(live, TEXT_NAME);
  binding.viewDocument.clientID = 141;

  assert.equal(text(live), "A😀\nB", "browser-incompatible CRLF is normalized on binding");
  binding.apply("A😃\nB"); // emoji share a high surrogate in UTF-16
  assert.equal(text(live), "A😃\nB");
  assert.equal(text(live).includes("�"), false);
  binding.apply("A😃\nB\nGrüße 🧪");
  assert.equal(text(live), "A😃\nB\nGrüße 🧪");

  binding.sync();
  const remote = cloneDocument(live, 142);
  remote.getText(TEXT_NAME).insert(3, "🌍");
  syncOneWay(remote, live);
  binding.apply("A\nB\nGrüße 🧪"); // stale deletion of 😃 must retain unseen 🌍
  assert.equal(text(live), "A🌍\nB\nGrüße 🧪");
  assert.equal(text(live).includes("�"), false);

  binding.destroy();
  live.destroy();
  remote.destroy();
});

test("concurrent first edits after CRLF normalization do not duplicate lines", () => {
  const seed = docWithText("one\r\ntwo\r\nthree", 150);
  const left = cloneDocument(seed, 151);
  const right = cloneDocument(seed, 152);
  const leftBinding = new CollaborativeTextBinding(left, TEXT_NAME);
  const rightBinding = new CollaborativeTextBinding(right, TEXT_NAME);
  leftBinding.viewDocument.clientID = 153;
  rightBinding.viewDocument.clientID = 154;

  assert.equal(leftBinding.value, "one\ntwo\nthree");
  assert.equal(rightBinding.value, "one\ntwo\nthree");
  leftBinding.apply("one\ntwo\nthreeA");
  rightBinding.apply("Bone\ntwo\nthree");
  syncOneWay(left, right);
  syncOneWay(right, left);
  leftBinding.sync();
  rightBinding.sync();

  assert.equal(text(left), "Bone\ntwo\nthreeA");
  assert.equal(text(right), text(left));
  assert.equal(leftBinding.value, text(left));
  assert.equal(rightBinding.value, text(left));

  leftBinding.destroy();
  rightBinding.destroy();
  seed.destroy();
  left.destroy();
  right.destroy();
});

test("concurrent first browser edits of lone-CR documents do not duplicate lines", () => {
  const seed = docWithText("one\rtwo\rthree", 160);
  const left = cloneDocument(seed, 161);
  const right = cloneDocument(seed, 162);
  const leftBinding = new CollaborativeTextBinding(left, TEXT_NAME);
  const rightBinding = new CollaborativeTextBinding(right, TEXT_NAME);
  leftBinding.viewDocument.clientID = 163;
  rightBinding.viewDocument.clientID = 164;

  assert.equal(text(left), "one\rtwo\rthree", "lone CR items stay structurally stable");
  assert.equal(leftBinding.value, "one\ntwo\nthree");
  assert.equal(rightBinding.value, "one\ntwo\nthree");
  assert.equal(leftBinding.apply("one\ntwo\nthree"), null, "browser-only normalization is not a CRDT edit");

  leftBinding.apply("Aone\ntwo\nthree");
  rightBinding.apply("one\ntwo\nthreeB");
  syncOneWay(left, right);
  syncOneWay(right, left);
  leftBinding.sync();
  rightBinding.sync();

  assert.equal(text(left), "Aone\rtwo\rthreeB");
  assert.equal(text(right), text(left));
  assert.equal(leftBinding.value, "Aone\ntwo\nthreeB");
  assert.equal(rightBinding.value, leftBinding.value);
  assert.equal(leftBinding.value.split("two").length - 1, 1);

  leftBinding.destroy();
  rightBinding.destroy();
  seed.destroy();
  left.destroy();
  right.destroy();
});

test("deterministic multi-client stress converges after stale edits and shuffled delivery", () => {
  let randomState = 0x1a2b3c4d;
  const random = () => {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return randomState >>> 0;
  };

  const seed = docWithText("collaboration", 200);
  const documents = Array.from({ length: 5 }, (_, index) => cloneDocument(seed, 210 + index));
  const bindings = documents.map((document, index) => {
    const binding = new CollaborativeTextBinding(document, TEXT_NAME);
    binding.viewDocument.clientID = 300 + index;
    return binding;
  });
  const updates: Uint8Array[] = [];

  for (let step = 0; step < 120; step++) {
    if (updates.length > 0) {
      const target = random() % documents.length;
      const update = updates[random() % updates.length];
      Y.applyUpdate(documents[target], update);
      if (step % 5 === 0) bindings[target].sync();
    }

    const client = random() % bindings.length;
    const binding = bindings[client];
    const current = binding.value;
    const position = random() % (current.length + 1);
    let next: string;
    if (current.length > 0 && step % 4 === 0 && position < current.length) {
      next = current.slice(0, position) + current.slice(position + 1);
    } else {
      const inserted = String.fromCharCode(97 + (step % 26));
      next = current.slice(0, position) + inserted + current.slice(position);
    }
    const update = binding.apply(next, `stress-${step}`);
    if (update) updates.push(update);
    if (step % 7 === 0) binding.sync();
  }

  for (let target = 0; target < documents.length; target++) {
    const order = updates.map((_, index) => index);
    for (let index = order.length - 1; index > 0; index--) {
      const swap = random() % (index + 1);
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    for (const updateIndex of order) Y.applyUpdate(documents[target], updates[updateIndex]);
    for (let duplicate = 0; duplicate < 10; duplicate++) {
      Y.applyUpdate(documents[target], updates[random() % updates.length]);
    }
    bindings[target].sync();
  }

  const converged = text(documents[0]);
  assert.ok(converged.length > 0);
  for (let index = 0; index < documents.length; index++) {
    assert.equal(text(documents[index]), converged);
    assert.equal(bindings[index].value, converged);
    assertSameState(documents[0], documents[index]);
  }

  bindings.forEach((binding) => binding.destroy());
  documents.forEach((document) => document.destroy());
  seed.destroy();
});

test("destroy is idempotent and prevents accidental reuse", () => {
  const live = docWithText("done", 400);
  const binding = new CollaborativeTextBinding(live, TEXT_NAME);
  binding.destroy();
  binding.destroy();
  assert.throws(() => binding.apply("again"), /destroyed/);
  assert.throws(() => binding.sync(), /destroyed/);
  assert.throws(() => binding.value, /destroyed/);
  live.destroy();
});
