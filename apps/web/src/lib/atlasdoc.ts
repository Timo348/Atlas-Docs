import * as Y from "yjs";

export const ATLASDOC_MAP = "atlasdoc";
export const ATLASDOC_VERSION = 1;
export const ATLASDOC_PAGE_WIDTH = 794;
export const ATLASDOC_PAGE_HEIGHT = 1123;
export const ATLASDOC_GRID_SIZE = 24;

export const ATLASDOC_ELEMENT_TYPES = [
  "text",
  "heading",
  "quote",
  "code",
  "table",
  "image",
  "link",
  "divider",
  "toc",
  "snippet",
] as const;
export type AtlasDocElementType = typeof ATLASDOC_ELEMENT_TYPES[number];

export type AtlasDocTextAlign = "left" | "center" | "right";
export type AtlasDocElementStyle = {
  fontSize: number;
  color: string;
  backgroundColor: string;
  textAlign: AtlasDocTextAlign;
  fontWeight: number;
  fontFamily: string;
  lineHeight: number;
  indent: number;
};

export type AtlasDocSnippet = {
  id: string;
  name: string;
  command: string;
  description: string;
  html: string;
  css: string;
};

export type AtlasDocElement = {
  id: string;
  type: AtlasDocElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  locked: boolean;
  text: string;
  language: string;
  href: string;
  src: string;
  alt: string;
  rows: string[][];
  snippet: AtlasDocSnippet | null;
  style: AtlasDocElementStyle;
};

export type AtlasDocSettings = {
  gridVisible: boolean;
  snapToGrid: boolean;
};

export type AtlasDocState = {
  settings: AtlasDocSettings;
  elements: AtlasDocElement[];
  snippets: AtlasDocSnippet[];
};

export type AtlasDocElementInput = Partial<Omit<AtlasDocElement, "id" | "type" | "style" | "snippet">> & {
  type: AtlasDocElementType;
  style?: Partial<AtlasDocElementStyle>;
  snippet?: AtlasDocSnippet | null;
};

export type AtlasDocElementPatch = Partial<Omit<AtlasDocElement, "id" | "type" | "style" | "snippet">> & {
  style?: Partial<AtlasDocElementStyle>;
  snippet?: AtlasDocSnippet | null;
};

export const DEFAULT_ATLASDOC_SNIPPETS: AtlasDocSnippet[] = [
  {
    id: "callout",
    name: "Callout",
    command: "callout",
    description: "A restrained information box for important notes.",
    html: '<aside class="atlas-callout"><strong>Note</strong><p>Write a useful note here.</p></aside>',
    css: ".atlas-callout { border-left: 4px solid #2f6bd3; background: #eef4ff; color: #172033; padding: 16px 18px; font: 15px/1.5 system-ui, sans-serif; } .atlas-callout strong { display: block; margin-bottom: 6px; } .atlas-callout p { margin: 0; }",
  },
  {
    id: "approval",
    name: "Approval note",
    command: "approval",
    description: "A compact sign-off block for document workflows.",
    html: '<section class="atlas-approval"><strong>Review status</strong><p>Prepared for review · __________________</p></section>',
    css: ".atlas-approval { border: 1px solid #c9d1dc; background: #f8fafc; color: #273244; padding: 16px 18px; font: 14px/1.45 system-ui, sans-serif; } .atlas-approval strong { display: block; margin-bottom: 8px; } .atlas-approval p { margin: 0; }",
  },
];

const DEFAULT_SETTINGS: AtlasDocSettings = { gridVisible: false, snapToGrid: true };
const ATLASDOC_LOCAL_ORIGIN = Symbol("atlasdoc-local-edit");

export function createAtlasDocUndoManager(document: Y.Doc) {
  return new Y.UndoManager(document.getMap(ATLASDOC_MAP), {
    trackedOrigins: new Set([ATLASDOC_LOCAL_ORIGIN]),
    captureTimeout: 500,
  });
}

export function initializeAtlasDoc(document: Y.Doc, language: "en" | "de" = "en") {
  const root = document.getMap<unknown>(ATLASDOC_MAP);
  if (root.get("version") === ATLASDOC_VERSION && root.get("elements") instanceof Y.Map) return false;

  const elements = new Y.Map<unknown>();
  const snippets = new Y.Map<unknown>();
  const defaults = defaultAtlasDocElements(language);
  document.transact(() => {
    root.clear();
    root.set("version", ATLASDOC_VERSION);
    root.set("settings", { ...DEFAULT_SETTINGS });
    root.set("elements", elements);
    root.set("snippets", snippets);
    for (const element of defaults) elements.set(element.id, element);
    for (const snippet of DEFAULT_ATLASDOC_SNIPPETS) snippets.set(snippet.id, snippet);
  }, "initialize-atlasdoc");
  return true;
}

export function readAtlasDoc(document: Y.Doc): AtlasDocState {
  const root = document.getMap<unknown>(ATLASDOC_MAP);
  const elementsMap = root.get("elements");
  const snippetsMap = root.get("snippets");
  const elements = elementsMap instanceof Y.Map
    ? Array.from(elementsMap.entries()).map(([id, value]) => normalizeAtlasDocElement({ id, ...(isRecord(value) ? value : {}) })).filter(Boolean) as AtlasDocElement[]
    : [];
  const snippets = snippetsMap instanceof Y.Map
    ? Array.from(snippetsMap.entries()).map(([id, value]) => normalizeSnippet({ id, ...(isRecord(value) ? value : {}) })).filter(Boolean) as AtlasDocSnippet[]
    : [];
  const settings = normalizeSettings(root.get("settings"));
  return {
    settings,
    elements: elements.sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id)),
    snippets: snippets.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
  };
}

export function createAtlasDocElement(input: AtlasDocElementInput, language: "en" | "de" = "en") {
  const defaults = defaultElement(input.type, language);
  return normalizeAtlasDocElement({ ...defaults, ...input, style: { ...defaults.style, ...input.style } });
}

export function addAtlasDocElement(document: Y.Doc, input: AtlasDocElementInput, language: "en" | "de" = "en") {
  const elements = ensureElementsMap(document, language);
  const current = readAtlasDoc(document).elements;
  const element = createAtlasDocElement({
    ...input,
    x: input.x ?? 60,
    y: input.y ?? nextElementY(current),
  }, language);
  document.transact(() => elements.set(element.id, element), ATLASDOC_LOCAL_ORIGIN);
  return element.id;
}

export function updateAtlasDocElement(document: Y.Doc, id: string, patch: AtlasDocElementPatch) {
  const root = document.getMap<unknown>(ATLASDOC_MAP);
  const elements = root.get("elements");
  if (!(elements instanceof Y.Map)) return false;
  const currentValue = elements.get(id);
  if (!isRecord(currentValue)) return false;
  const current = normalizeAtlasDocElement({ id, ...currentValue });
  const next = normalizeAtlasDocElement({
    ...current,
    ...patch,
    id,
    style: { ...current.style, ...patch.style },
  });
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    document.transact(() => elements.set(id, next), ATLASDOC_LOCAL_ORIGIN);
  }
  return true;
}

export function deleteAtlasDocElement(document: Y.Doc, id: string) {
  const elements = document.getMap<unknown>(ATLASDOC_MAP).get("elements");
  if (!(elements instanceof Y.Map) || !elements.has(id)) return false;
  document.transact(() => elements.delete(id), ATLASDOC_LOCAL_ORIGIN);
  return true;
}

export function updateAtlasDocSettings(document: Y.Doc, patch: Partial<AtlasDocSettings>) {
  const root = document.getMap<unknown>(ATLASDOC_MAP);
  const settings = normalizeSettings(root.get("settings"));
  const next = normalizeSettings({ ...settings, ...patch });
  if (JSON.stringify(settings) !== JSON.stringify(next)) {
    document.transact(() => root.set("settings", next), ATLASDOC_LOCAL_ORIGIN);
  }
}

export function upsertAtlasDocSnippet(document: Y.Doc, snippet: Omit<AtlasDocSnippet, "id"> & { id?: string }) {
  const root = document.getMap<unknown>(ATLASDOC_MAP);
  const snippets = root.get("snippets");
  if (!(snippets instanceof Y.Map)) return null;
  const normalized = normalizeSnippet({ ...snippet, id: snippet.id || createId("snippet") });
  if (JSON.stringify(snippets.get(normalized.id)) !== JSON.stringify(normalized)) {
    document.transact(() => snippets.set(normalized.id, normalized), ATLASDOC_LOCAL_ORIGIN);
  }
  return normalized.id;
}

export function deleteAtlasDocSnippet(document: Y.Doc, id: string) {
  if (DEFAULT_ATLASDOC_SNIPPETS.some((snippet) => snippet.id === id)) return false;
  const snippets = document.getMap<unknown>(ATLASDOC_MAP).get("snippets");
  if (!(snippets instanceof Y.Map) || !snippets.has(id)) return false;
  document.transact(() => snippets.delete(id), ATLASDOC_LOCAL_ORIGIN);
  return true;
}

export function serializeAtlasDoc(document: Y.Doc) {
  const state = readAtlasDoc(document);
  return `${JSON.stringify({
    format: "atlasdoc",
    version: ATLASDOC_VERSION,
    page: { width: ATLASDOC_PAGE_WIDTH, height: ATLASDOC_PAGE_HEIGHT, unit: "css-px-at-96dpi" },
    settings: state.settings,
    elements: state.elements,
    snippets: state.snippets,
  }, null, 2)}\n`;
}

export function serializeAtlasDocState(data: Uint8Array | null | undefined) {
  const document = new Y.Doc();
  try {
    if (data?.byteLength) Y.applyUpdate(document, data);
    if (document.getMap<unknown>(ATLASDOC_MAP).get("version") !== ATLASDOC_VERSION) initializeAtlasDoc(document);
    return serializeAtlasDoc(document);
  } finally {
    document.destroy();
  }
}

export function createAtlasDocCollaborationStateFromJson(source: string) {
  const parsed = JSON.parse(source) as unknown;
  if (!isRecord(parsed) || parsed.format !== "atlasdoc") throw new Error("Invalid .atlasdoc document.");
  const document = new Y.Doc();
  try {
    writeAtlasDocState(document, normalizeSerializedState(parsed));
    return Y.encodeStateAsUpdate(document);
  } finally {
    document.destroy();
  }
}

export function copyAtlasDoc(source: Y.Doc, target: Y.Doc) {
  writeAtlasDocState(target, readAtlasDoc(source));
}

function writeAtlasDocState(document: Y.Doc, state: AtlasDocState) {
  const root = document.getMap<unknown>(ATLASDOC_MAP);
  const elements = new Y.Map<unknown>();
  const snippets = new Y.Map<unknown>();
  document.transact(() => {
    root.clear();
    root.set("version", ATLASDOC_VERSION);
    root.set("settings", state.settings);
    root.set("elements", elements);
    root.set("snippets", snippets);
    for (const element of state.elements) elements.set(element.id, element);
    for (const snippet of state.snippets) snippets.set(snippet.id, snippet);
  }, "write-atlasdoc-state");
}

function normalizeSerializedState(value: Record<string, unknown>): AtlasDocState {
  const rawElements = Array.isArray(value.elements) ? value.elements : [];
  const rawSnippets = Array.isArray(value.snippets) ? value.snippets : [];
  const elements = rawElements.map((item, index) => normalizeAtlasDocElement({
    id: `element-${index + 1}`,
    ...(isRecord(item) ? item : {}),
  }));
  const snippets = rawSnippets.map((item, index) => normalizeSnippet({
    id: `snippet-${index + 1}`,
    ...(isRecord(item) ? item : {}),
  }));
  return {
    settings: normalizeSettings(value.settings),
    elements,
    snippets: mergeDefaultSnippets(snippets),
  };
}

function ensureElementsMap(document: Y.Doc, language: "en" | "de") {
  const root = document.getMap<unknown>(ATLASDOC_MAP);
  if (root.get("version") !== ATLASDOC_VERSION) initializeAtlasDoc(document, language);
  const existing = root.get("elements");
  if (existing instanceof Y.Map) return existing as Y.Map<unknown>;
  const elements = new Y.Map<unknown>();
  root.set("elements", elements);
  return elements;
}

function defaultAtlasDocElements(language: "en" | "de") {
  const heading = createAtlasDocElement({ type: "heading", x: 60, y: 70, width: 674, height: 64, text: language === "de" ? "Neues Atlas-Dokument" : "New Atlas document" }, language);
  const body = createAtlasDocElement({ type: "text", x: 60, y: 154, width: 674, height: 120, text: language === "de" ? "Beginne mit einem freien A4-Layout. Nutze / für Dokumentelemente." : "Start with a free A4 layout. Type / to insert document elements." }, language);
  return [heading, body];
}

function defaultElement(type: AtlasDocElementType, language: "en" | "de"): AtlasDocElement {
  const text = type === "heading"
    ? language === "de" ? "Überschrift" : "Heading"
    : type === "quote"
      ? language === "de" ? "Zitat oder Leitgedanke" : "Quote or guiding thought"
      : type === "code"
        ? "const answer = true;"
        : type === "link"
          ? language === "de" ? "Link öffnen" : "Open link"
          : type === "text"
            ? language === "de" ? "Text hier eingeben" : "Enter text here"
            : "";
  const style: AtlasDocElementStyle = {
    fontSize: type === "heading" ? 30 : type === "code" ? 14 : 16,
    color: type === "code" ? "#18304b" : "#20252d",
    backgroundColor: type === "code" ? "#f1f5f9" : "transparent",
    textAlign: "left",
    fontWeight: type === "heading" ? 700 : type === "quote" ? 500 : 400,
    fontFamily: type === "code" ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : "system-ui, sans-serif",
    lineHeight: type === "heading" ? 1.15 : 1.5,
    indent: 0,
  };
  const dimensions: Record<AtlasDocElementType, { width: number; height: number }> = {
    text: { width: 674, height: 104 },
    heading: { width: 674, height: 64 },
    quote: { width: 674, height: 96 },
    code: { width: 674, height: 130 },
    table: { width: 674, height: 150 },
    image: { width: 360, height: 220 },
    link: { width: 320, height: 52 },
    divider: { width: 674, height: 18 },
    toc: { width: 320, height: 180 },
    snippet: { width: 420, height: 180 },
  };
  return {
    id: createId("element"),
    type,
    x: 60,
    y: 300,
    width: dimensions[type].width,
    height: dimensions[type].height,
    locked: false,
    text,
    language: "text",
    href: "https://example.com",
    src: "",
    alt: "",
    rows: [["Column 1", "Column 2"], ["Value", "Value"]],
    snippet: type === "snippet" ? DEFAULT_ATLASDOC_SNIPPETS[0] : null,
    style,
  };
}

function normalizeAtlasDocElement(value: Record<string, unknown>): AtlasDocElement {
  const type = isElementType(value.type) ? value.type : "text";
  const fallback = defaultElement(type, "en");
  const rawRows = Array.isArray(value.rows) ? value.rows : fallback.rows;
  const rows = rawRows
    .slice(0, 30)
    .map((row) => Array.isArray(row) ? row.slice(0, 12).map((cell) => normalizeString(cell, "" , 300)) : [])
    .filter((row) => row.length > 0);
  return {
    id: normalizeString(value.id, fallback.id, 120),
    type,
    x: clampNumber(value.x, fallback.x, 0, ATLASDOC_PAGE_WIDTH - 40),
    y: clampNumber(value.y, fallback.y, 0, ATLASDOC_PAGE_HEIGHT - 24),
    width: clampNumber(value.width, fallback.width, 40, ATLASDOC_PAGE_WIDTH),
    height: clampNumber(value.height, fallback.height, 18, ATLASDOC_PAGE_HEIGHT),
    locked: value.locked === true,
    text: normalizeString(value.text, fallback.text, 50_000),
    language: normalizeString(value.language, fallback.language, 40),
    href: normalizeString(value.href, fallback.href, 2_000),
    src: normalizeString(value.src, fallback.src, 4_000),
    alt: normalizeString(value.alt, fallback.alt, 500),
    rows: rows.length ? rows : fallback.rows,
    snippet: value.snippet && isRecord(value.snippet) ? normalizeSnippet(value.snippet) : fallback.snippet,
    style: normalizeStyle(value.style, fallback.style),
  };
}

function normalizeSnippet(value: Record<string, unknown>): AtlasDocSnippet {
  return {
    id: normalizeString(value.id, createId("snippet"), 120),
    name: normalizeString(value.name, "Snippet", 120),
    command: normalizeCommand(value.command),
    description: normalizeString(value.description, "", 300),
    html: normalizeString(value.html, "<div>Snippet</div>", 20_000),
    css: normalizeString(value.css, "", 20_000),
  };
}

function normalizeStyle(value: unknown, fallback: AtlasDocElementStyle): AtlasDocElementStyle {
  const candidate = isRecord(value) ? value : {};
  const textAlign = candidate.textAlign === "center" || candidate.textAlign === "right" ? candidate.textAlign : candidate.textAlign === "left" ? "left" : fallback.textAlign;
  return {
    fontSize: clampNumber(candidate.fontSize, fallback.fontSize, 8, 96),
    color: normalizeCssColor(candidate.color, fallback.color),
    backgroundColor: normalizeCssColor(candidate.backgroundColor, fallback.backgroundColor),
    textAlign,
    fontWeight: clampNumber(candidate.fontWeight, fallback.fontWeight, 300, 800),
    fontFamily: normalizeString(candidate.fontFamily, fallback.fontFamily, 160),
    lineHeight: clampNumber(candidate.lineHeight, fallback.lineHeight, 1, 3),
    indent: clampNumber(candidate.indent, fallback.indent, 0, 96),
  };
}

function normalizeSettings(value: unknown): AtlasDocSettings {
  const candidate = isRecord(value) ? value : {};
  return {
    gridVisible: candidate.gridVisible === true,
    snapToGrid: candidate.snapToGrid !== false,
  };
}

function mergeDefaultSnippets(snippets: AtlasDocSnippet[]) {
  const byId = new Map(DEFAULT_ATLASDOC_SNIPPETS.map((snippet) => [snippet.id, snippet]));
  for (const snippet of snippets) byId.set(snippet.id, snippet);
  return Array.from(byId.values());
}

function nextElementY(elements: AtlasDocElement[]) {
  const bottom = elements.reduce((value, element) => Math.max(value, element.y + element.height), 180);
  return Math.min(Math.max(60, bottom + 24), ATLASDOC_PAGE_HEIGHT - 120);
}

function isElementType(value: unknown): value is AtlasDocElementType {
  return typeof value === "string" && (ATLASDOC_ELEMENT_TYPES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function normalizeCommand(value: unknown) {
  const command = normalizeString(value, "snippet", 48).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return command || "snippet";
}

function normalizeCssColor(value: unknown, fallback: string) {
  if (typeof value !== "string" || value.length > 80) return fallback;
  return /^[#a-z0-9(),.%\s-]+$/i.test(value) ? value : fallback;
}

function clampNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function createId(prefix: string) {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
