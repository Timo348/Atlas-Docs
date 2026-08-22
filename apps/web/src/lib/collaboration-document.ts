import * as Y from "yjs";
import { initializeTodoBoard } from "@/lib/todo-board";

export type CollaborationPageFormat = "MARKDOWN" | "LATEX" | "CANVAS" | "MERMAID" | "GANTT" | "TODO" | "TEXT" | "FILE";
export type CollaborationLanguage = "en" | "de";

const TEXT_NAME = "markdown";
const STRUCTURALLY_EMPTY_STATE = createStructurallyEmptyState();

export function collaborationDocumentName(pageId: string) {
  return `page:${pageId}`;
}

export function resolveCollaborationLanguage(
  preferred: string | null | undefined,
  fallback: string | null | undefined,
): CollaborationLanguage {
  if (preferred === "de" || preferred === "en") return preferred;
  return fallback === "de" ? "de" : "en";
}

export function initialCollaborationContent(
  format: CollaborationPageFormat,
  language: CollaborationLanguage,
) {
  if (format === "CANVAS") return "";
  if (format === "TEXT" || format === "FILE" || format === "TODO") return "";
  if (format === "MERMAID") return "flowchart LR\n  Start --> Ende\n";
  if (format === "GANTT") return language === "de"
    ? "gantt\n  title Projektplan\n  dateFormat YYYY-MM-DD\n  axisFormat %d.%m.\n  section Planung\n  Anforderungen :done, anforderungen, 2026-09-01, 5d\n  Umsetzung     :active, umsetzung, after anforderungen, 10d\n  Abnahme       : abnahme, after umsetzung, 3d\n"
    : "gantt\n  title Project timeline\n  dateFormat YYYY-MM-DD\n  axisFormat %b %d\n  section Planning\n  Requirements :done, requirements, 2026-09-01, 5d\n  Implementation :active, implementation, after requirements, 10d\n  Review : review, after implementation, 3d\n";
  const heading = language === "de" ? "Überschrift" : "Headline";
  if (format === "LATEX") {
    return `\\documentclass{article}
\\begin{document}
\\section{${escapeLatex(heading)}}
\\end{document}
`;
  }
  return `# ${heading}\n`;
}

/**
 * Seeds a fresh Yjs document. The guard makes accidental repeated calls on the
 * same document idempotent, while Yjs itself makes applying the returned update
 * more than once idempotent as well.
 */
export function initializeCollaborationDocument(
  document: Y.Doc,
  format: CollaborationPageFormat,
  language: CollaborationLanguage,
) {
  if (format === "CANVAS") {
    const settings = document.getMap<unknown>("canvas-settings");
    if (settings.size > 0) return false;
    settings.set("viewBackgroundColor", "#fbfaf7");
    return true;
  }
  if (format === "TODO") return initializeTodoBoard(document);
  const text = document.getText(TEXT_NAME);
  if (text.length > 0) return false;

  text.insert(0, initialCollaborationContent(format, language));
  return true;
}

export function createInitialCollaborationState(
  format: CollaborationPageFormat,
  language: CollaborationLanguage,
) {
  const document = new Y.Doc();
  try {
    initializeCollaborationDocument(document, format, language);
    return Y.encodeStateAsUpdate(document);
  } finally {
    document.destroy();
  }
}

export function createTextCollaborationState(content: string) {
  const document = new Y.Doc();
  try {
    if (content) document.getText(TEXT_NAME).insert(0, content);
    return Y.encodeStateAsUpdate(document);
  } finally {
    document.destroy();
  }
}

/**
 * Identifies legacy placeholders that never contained a Yjs client struct.
 * Any other non-empty byte sequence is preserved: that includes a document
 * whose visible text was deleted as well as malformed data requiring recovery.
 */
export function collaborationStateNeedsInitialization(
  state: Uint8Array | null | undefined,
) {
  return !state
    || state.byteLength === 0
    || byteArraysEqual(state, STRUCTURALLY_EMPTY_STATE);
}

/**
 * A native Prisma upsert needs a non-empty update branch. Updating the unique
 * name to itself is an intentional no-op and, importantly, never replaces an
 * existing document's Yjs state.
 */
export function initialCollaborationDocumentUpsert(
  pageId: string,
  format: CollaborationPageFormat,
  language: CollaborationLanguage,
) {
  const name = collaborationDocumentName(pageId);
  return {
    where: { name },
    update: { name },
    create: {
      name,
      data: createInitialCollaborationState(format, language),
    },
  };
}

function escapeLatex(value: string) {
  return value.replace(/[#$%&_{}]/g, (character) => `\\${character}`);
}

function createStructurallyEmptyState() {
  const document = new Y.Doc();
  try {
    return Y.encodeStateAsUpdate(document);
  } finally {
    document.destroy();
  }
}

function byteArraysEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
