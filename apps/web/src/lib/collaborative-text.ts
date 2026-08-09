import * as Y from "yjs";

/** A JSON-safe Yjs relative position, as used in awareness payloads. */
export type SerializedRelativePosition = number[];

/**
 * Selection payload published through awareness. `index` is retained for
 * clients that only understand a single absolute caret position.
 */
export type CollaborativeCursor = {
  anchor: SerializedRelativePosition;
  head: SerializedRelativePosition;
  index: number;
  surface?: CollaborativeCursorSurface;
};

export type ResolvedCollaborativeCursor = {
  anchor: number;
  head: number;
  index: number;
  surface?: ResolvedCollaborativeCursorSurface;
};

export type CollaborativeTextSurface = { kind: "text" };
export type ResolvedCollaborativeTextSurface = { kind: "text" };

export type CollaborativeTableCellSurface = {
  kind: "table-cell";
  tableStart: SerializedRelativePosition;
  row: number;
  column: number;
};

export type ResolvedCollaborativeTableCellSurface = {
  kind: "table-cell";
  tableStart: number;
  row: number;
  column: number;
};

export type CollaborativeCursorSurface = CollaborativeTextSurface | CollaborativeTableCellSurface;
export type ResolvedCollaborativeCursorSurface = ResolvedCollaborativeTextSurface | ResolvedCollaborativeTableCellSurface;

export type CollaborativeTextChange = {
  start: number;
  end: number;
  value: string;
};

export type CollaborativePresenceUser = {
  id: string;
  name: string;
  color: string;
  hasAvatar: boolean;
  avatarVersion: number;
};

export type CollaborativePresence = {
  clientId: number;
  user: CollaborativePresenceUser;
  cursor: ResolvedCollaborativeCursor | null;
};

const MAX_RELATIVE_POSITION_BYTES = 4096;
const MAX_YJS_CLIENT_ID = 0xffffffff;
const MAX_TABLE_COORDINATE = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHighSurrogate(code: number) {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number) {
  return code >= 0xdc00 && code <= 0xdfff;
}

function splitsSurrogatePair(value: string, index: number) {
  return index > 0
    && index < value.length
    && isHighSurrogate(value.charCodeAt(index - 1))
    && isLowSurrogate(value.charCodeAt(index));
}

/** Find one contiguous replacement without ever slicing a valid UTF-16 pair. */
function contiguousReplacement(previous: string, next: string) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  if (splitsSurrogatePair(previous, start) || splitsSurrogatePair(next, start)) start--;

  let previousEnd = previous.length;
  let nextEnd = next.length;
  while (
    previousEnd > start
    && nextEnd > start
    && previous[previousEnd - 1] === next[nextEnd - 1]
  ) {
    previousEnd--;
    nextEnd--;
  }
  if (splitsSurrogatePair(previous, previousEnd) || splitsSurrogatePair(next, nextEnd)) {
    previousEnd++;
    nextEnd++;
  }

  return { start, previousEnd, nextEnd };
}

function bytesFromSerializedPosition(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    if (value.length === 0 || value.length > MAX_RELATIVE_POSITION_BYTES) return null;
    return new Uint8Array(value);
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RELATIVE_POSITION_BYTES) return null;
  if (!value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return null;
  return Uint8Array.from(value as number[]);
}

function byteArraysEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function resolveRelativePosition(
  value: unknown,
  document: Y.Doc,
  expectedText: Y.Text,
): number | null {
  const bytes = bytesFromSerializedPosition(value);
  if (!bytes) return null;
  try {
    const relative = Y.decodeRelativePosition(bytes);
    // Reject trailing bytes and other non-canonical encodings as malformed data.
    if (!byteArraysEqual(bytes, Y.encodeRelativePosition(relative))) return null;
    const absolute = Y.createAbsolutePositionFromRelativePosition(relative, document);
    if (!absolute || absolute.type !== expectedText || !Number.isSafeInteger(absolute.index)) return null;
    return Math.max(0, Math.min(expectedText.length, absolute.index));
  } catch {
    return null;
  }
}

function safeText(document: Y.Doc, textName: string): Y.Text | null {
  try {
    return document.getText(textName);
  } catch {
    return null;
  }
}

function legacyCursorIndex(value: unknown, textLength: number): number | null {
  if (!isRecord(value)) return null;
  const index = value.index;
  if (!Number.isSafeInteger(index) || (index as number) < 0) return null;
  return Math.min(textLength, index as number);
}

function selectionIndex(index: number, textLength: number) {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(textLength, Math.trunc(index)));
}

/** Create a relative selection plus a legacy absolute HEAD/caret index. */
export function createCollaborativeCursor(
  document: Y.Doc,
  textName: string,
  anchor: number,
  head = anchor,
): CollaborativeCursor {
  const text = document.getText(textName);
  const safeAnchor = selectionIndex(anchor, text.length);
  const safeHead = selectionIndex(head, text.length);
  return {
    anchor: Array.from(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, safeAnchor))),
    head: Array.from(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, safeHead))),
    index: safeHead,
  };
}

export function createCollaborativeTextCursor(
  document: Y.Doc,
  textName: string,
  anchor: number,
  head = anchor,
): CollaborativeCursor {
  return {
    ...createCollaborativeCursor(document, textName, anchor, head),
    surface: { kind: "text" },
  };
}

/** Add stable visual-table context so a caret at the table's end is unambiguous. */
export function createCollaborativeTableCursor(
  document: Y.Doc,
  textName: string,
  tableStart: number,
  row: number,
  column: number,
  anchor: number,
  head = anchor,
): CollaborativeCursor {
  const text = document.getText(textName);
  const cursor = createCollaborativeCursor(document, textName, anchor, head);
  return {
    ...cursor,
    surface: {
      kind: "table-cell",
      tableStart: Array.from(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(
        text,
        selectionIndex(tableStart, text.length),
      ))),
      row: selectionIndex(row, MAX_TABLE_COORDINATE),
      column: selectionIndex(column, MAX_TABLE_COORDINATE),
    },
  };
}

function resolveCursorSurface(
  value: unknown,
  document: Y.Doc,
  expectedText: Y.Text,
): ResolvedCollaborativeCursorSurface | null {
  if (isRecord(value) && value.kind === "text") return { kind: "text" };
  if (
    !isRecord(value)
    || value.kind !== "table-cell"
    || !Number.isSafeInteger(value.row)
    || !Number.isSafeInteger(value.column)
    || (value.row as number) < 0
    || (value.column as number) < 0
    || (value.row as number) > MAX_TABLE_COORDINATE
    || (value.column as number) > MAX_TABLE_COORDINATE
  ) return null;
  const tableStart = resolveRelativePosition(value.tableStart, document, expectedText);
  return tableStart === null ? null : {
    kind: "table-cell",
    tableStart,
    row: value.row as number,
    column: value.column as number,
  };
}

/**
 * Resolve an awareness cursor against either the live or view document.
 * Invalid relative data never escapes as an exception; a valid legacy index is
 * used as a clamped, collapsed selection instead.
 */
export function resolveCollaborativeCursor(
  value: unknown,
  document: Y.Doc,
  textName: string,
): ResolvedCollaborativeCursor | null {
  const text = safeText(document, textName);
  if (!text || !isRecord(value)) return null;
  const anchor = resolveRelativePosition(value.anchor, document, text);
  const head = resolveRelativePosition(value.head, document, text);
  const surface = resolveCursorSurface(value.surface, document, text);
  if (anchor !== null && head !== null) {
    const cursor: ResolvedCollaborativeCursor = { anchor, head, index: head };
    if (surface) cursor.surface = surface;
    return cursor;
  }

  const index = legacyCursorIndex(value, text.length);
  if (index === null) return null;
  const cursor: ResolvedCollaborativeCursor = { anchor: index, head: index, index };
  if (surface) cursor.surface = surface;
  return cursor;
}

function parsePresenceUser(value: unknown): CollaborativePresenceUser | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" || value.id.length === 0
    || typeof value.name !== "string" || value.name.length === 0
    || typeof value.color !== "string" || value.color.length === 0
  ) return null;
  if (value.hasAvatar !== undefined && typeof value.hasAvatar !== "boolean") return null;
  if (
    value.avatarVersion !== undefined
    && (!Number.isSafeInteger(value.avatarVersion) || (value.avatarVersion as number) < 0)
  ) return null;
  return {
    id: value.id,
    name: value.name,
    color: value.color,
    hasAvatar: value.hasAvatar === true,
    avatarVersion: typeof value.avatarVersion === "number" ? value.avatarVersion : 0,
  };
}

function presenceRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  // Also accept Awareness#getStates() entries without making callers reshape a Map.
  if (
    Array.isArray(value)
    && value.length === 2
    && Number.isSafeInteger(value[0])
    && isRecord(value[1])
  ) return { ...value[1], clientId: value[0] };
  return null;
}

/**
 * Parse untrusted awareness state into distinct client sessions. A user with two
 * tabs remains two presences; only duplicate updates for the same clientId fold.
 */
export function parseCollaborativePresenceStates(
  states: Iterable<unknown> | null | undefined,
  document: Y.Doc,
  textName: string,
): CollaborativePresence[] {
  if (!states || typeof states[Symbol.iterator] !== "function") return [];
  const sessions = new Map<number, CollaborativePresence>();
  try {
    for (const candidate of states) {
      const state = presenceRecord(candidate);
      if (
        !state
        || !Number.isSafeInteger(state.clientId)
        || (state.clientId as number) < 0
        || (state.clientId as number) > MAX_YJS_CLIENT_ID
      ) continue;
      const user = parsePresenceUser(state.user);
      if (!user) continue;
      const clientId = state.clientId as number;
      sessions.set(clientId, {
        clientId,
        user,
        cursor: resolveCollaborativeCursor(state.cursor, document, textName),
      });
    }
  } catch {
    // Awareness is network input. Return all states parsed before a hostile iterator failed.
  }
  return Array.from(sessions.values());
}

/** Collapse client sessions to people for avatar/user summaries only. */
export function distinctCollaborativeUsers(
  presences: Iterable<CollaborativePresence>,
): CollaborativePresenceUser[] {
  const users = new Map<string, CollaborativePresenceUser>();
  for (const presence of presences) {
    if (!users.has(presence.user.id)) users.set(presence.user.id, presence.user);
  }
  return Array.from(users.values());
}

/**
 * Bridges a controlled textarea snapshot and a live Y.Doc without diffing
 * against unseen remote state. Call sync() after rendering a live update.
 */
export class CollaborativeTextBinding {
  readonly #liveDocument: Y.Doc;
  readonly #liveText: Y.Text;
  readonly #viewDocument: Y.Doc;
  readonly #viewText: Y.Text;
  #destroyed = false;
  #normalizingLineEndings = false;
  #liveHasCarriageReturn = false;

  constructor(liveDocument: Y.Doc, textName: string) {
    this.#liveDocument = liveDocument;
    this.#liveText = liveDocument.getText(textName);
    this.#viewDocument = new Y.Doc({
      gc: liveDocument.gc,
      gcFilter: liveDocument.gcFilter,
    });
    Y.applyUpdate(this.#viewDocument, Y.encodeStateAsUpdate(liveDocument), this);
    this.#viewText = this.#viewDocument.getText(textName);
    this.#liveHasCarriageReturn = this.#liveText.toString().includes("\r");
    this.#liveText.observe(this.#handleLiveTextUpdate);
    this.normalizeLineEndings();
  }

  get value() {
    this.#assertActive();
    return browserCompatibleText(this.#viewText.toString());
  }

  /** Exposed so relative selections can be created/resolved against the DOM view. */
  get viewDocument() {
    this.#assertActive();
    return this.#viewDocument;
  }

  get viewText() {
    this.#assertActive();
    return this.#viewText;
  }

  /**
   * Apply one contiguous DOM replacement to the view, then forward only the
   * Yjs update created since the pre-edit state vector to the live document.
   */
  apply(nextValue: string, origin?: unknown): Uint8Array | null {
    this.#assertActive();
    const previous = browserCompatibleText(this.#viewText.toString());
    if (previous === nextValue) return null;
    const { start, previousEnd, nextEnd } = contiguousReplacement(previous, nextValue);
    const stateVector = Y.encodeStateVector(this.#viewDocument);
    this.#viewDocument.transact(() => {
      if (previousEnd > start) this.#viewText.delete(start, previousEnd - start);
      if (nextEnd > start) this.#viewText.insert(start, nextValue.slice(start, nextEnd));
    }, origin);
    const update = Y.encodeStateAsUpdate(this.#viewDocument, stateVector);
    Y.applyUpdate(this.#liveDocument, update, origin);
    return update;
  }

  /**
   * Apply independent source ranges in one CRDT transaction. This is used for
   * structural edits such as adding a Markdown-table column to several lines:
   * unchanged cells between the ranges never become part of a delete operation.
   */
  applyChanges(changes: readonly CollaborativeTextChange[], origin?: unknown): Uint8Array | null {
    this.#assertActive();
    if (changes.length === 0) return null;
    const current = this.#viewText.toString();
    const ordered = changes.map((change) => ({ ...change })).sort((left, right) => left.start - right.start);
    for (let index = 0; index < ordered.length; index++) {
      const change = ordered[index];
      if (
        !Number.isSafeInteger(change.start)
        || !Number.isSafeInteger(change.end)
        || change.start < 0
        || change.end < change.start
        || change.end > current.length
        || typeof change.value !== "string"
        || splitsSurrogatePair(current, change.start)
        || splitsSurrogatePair(current, change.end)
        || (index > 0 && change.start < ordered[index - 1].end)
      ) throw new RangeError("Collaborative text changes must be valid, non-overlapping UTF-16 ranges.");
    }

    const stateVector = Y.encodeStateVector(this.#viewDocument);
    this.#viewDocument.transact(() => {
      for (const change of [...ordered].reverse()) {
        if (change.end > change.start) this.#viewText.delete(change.start, change.end - change.start);
        if (change.value.length > 0) this.#viewText.insert(change.start, change.value);
      }
    }, origin);
    const update = Y.encodeStateAsUpdate(this.#viewDocument, stateVector);
    Y.applyUpdate(this.#liveDocument, update, origin);
    return update;
  }

  /**
   * Textarea values are LF-only in browsers. Deleting the CR item from every
   * CRLF pair is a convergent, idempotent Yjs operation even when several
   * clients normalize the same imported document concurrently.
   */
  normalizeLineEndings(origin: unknown = "normalize-crlf"): Uint8Array | null {
    this.#assertActive();
    const value = this.#viewText.toString();
    const carriageReturns: number[] = [];
    for (let index = 0; index + 1 < value.length; index++) {
      if (value[index] === "\r" && value[index + 1] === "\n") carriageReturns.push(index);
    }
    if (carriageReturns.length === 0) return null;

    const stateVector = Y.encodeStateVector(this.#viewDocument);
    this.#normalizingLineEndings = true;
    try {
      this.#viewDocument.transact(() => {
        for (const index of carriageReturns.reverse()) this.#viewText.delete(index, 1);
      }, origin);
      const update = Y.encodeStateAsUpdate(this.#viewDocument, stateVector);
      Y.applyUpdate(this.#liveDocument, update, origin);
      this.#liveHasCarriageReturn = this.#liveText.toString().includes("\r");
      return update;
    } finally {
      this.#normalizingLineEndings = false;
    }
  }

  /** Merge all structurally missing live updates into the rendered view. */
  sync(origin?: unknown): Uint8Array {
    this.#assertActive();
    const update = Y.encodeStateAsUpdate(
      this.#liveDocument,
      Y.encodeStateVector(this.#viewDocument),
    );
    Y.applyUpdate(this.#viewDocument, update, origin);
    return update;
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#liveText.unobserve(this.#handleLiveTextUpdate);
    this.#viewDocument.destroy();
  }

  #handleLiveTextUpdate = (event: Y.YTextEvent) => {
    if (this.#destroyed || this.#normalizingLineEndings) return;
    const insertedCarriageReturn = event.delta.some(
      (change) => typeof change.insert === "string" && change.insert.includes("\r"),
    );
    const mayJoinCarriageReturnToLineFeed = this.#liveHasCarriageReturn && event.delta.some(
      (change) => (typeof change.insert === "string" && change.insert.includes("\n"))
        || (typeof change.delete === "number" && change.delete > 0),
    );
    if (!insertedCarriageReturn && !mayJoinCarriageReturnToLineFeed) return;
    this.#liveHasCarriageReturn ||= insertedCarriageReturn;
    const value = this.#liveText.toString();
    const carriageReturns: number[] = [];
    for (let index = 0; index + 1 < value.length; index++) {
      if (value[index] === "\r" && value[index + 1] === "\n") carriageReturns.push(index);
    }
    if (carriageReturns.length === 0) {
      this.#liveHasCarriageReturn = value.includes("\r");
      return;
    }
    this.#normalizingLineEndings = true;
    try {
      this.#liveDocument.transact(() => {
        for (const index of carriageReturns.reverse()) this.#liveText.delete(index, 1);
      }, "normalize-live-crlf");
      this.#liveHasCarriageReturn = this.#liveText.toString().includes("\r");
    } finally {
      this.#normalizingLineEndings = false;
    }
  };

  #assertActive() {
    if (this.#destroyed) throw new Error("CollaborativeTextBinding has been destroyed.");
  }
}

/**
 * Browsers expose both CRLF and legacy lone-CR line endings as LF in textarea
 * values. CRLF is normalized structurally because it changes the UTF-16
 * length. A lone CR is only projected to LF: both occupy one code unit, so all
 * edit and relative-cursor offsets continue to address the original Yjs item.
 * This avoids two clients independently inserting duplicate LF items.
 */
function browserCompatibleText(value: string) {
  return value.replaceAll("\r", "\n");
}
