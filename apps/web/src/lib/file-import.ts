import * as Y from "yjs";
import { CodedApiError } from "@/lib/api-errors";
import { uploadLimitBytes } from "@/lib/upload-limit";

export type ImportPageFormat = "MARKDOWN" | "LATEX" | "CANVAS" | "PDF";

type ImportedTextFile = {
  format: "MARKDOWN" | "LATEX";
  name: string;
  collaborationState: Uint8Array;
};
type ImportedCanvasFile = {
  format: "CANVAS";
  name: string;
  collaborationState: Uint8Array;
};
type ImportedPdfFile = {
  format: "PDF";
  name: string;
  bytes: Uint8Array;
};
export type ImportedFile = ImportedTextFile | ImportedCanvasFile | ImportedPdfFile;

export async function readImportedFile(file: File): Promise<ImportedFile> {
  const bytes = await readUpload(file);
  const extension = fileExtension(file.name);
  const name = cleanFileName(file.name);

  if (extension === "pdf") {
    validatePdfBytes(bytes);
    return { format: "PDF", name, bytes };
  }

  if (extension === "md" || extension === "markdown" || extension === "tex" || extension === "latex") {
    const source = decodeUtf8(bytes);
    const format = extension === "tex" || extension === "latex" ? "LATEX" : "MARKDOWN";
    return { format, name, collaborationState: createTextState(source) };
  }

  if (extension === "excalidraw") {
    return { format: "CANVAS", name, collaborationState: createCanvasState(decodeUtf8(bytes)) };
  }

  throw new CodedApiError("FILE_INVALID_TYPE");
}

export async function readValidatedPdf(file: File) {
  const bytes = await readUpload(file);
  validatePdfBytes(bytes);
  return { bytes, name: cleanFileName(file.name), mime: "application/pdf" as const };
}

export function validatePdfBytes(bytes: Uint8Array) {
  const headerSearchLength = Math.min(bytes.length, 1024);
  const header = new TextDecoder("latin1").decode(bytes.subarray(0, headerSearchLength));
  const trailerStart = Math.max(0, bytes.length - 4096);
  const trailer = new TextDecoder("latin1").decode(bytes.subarray(trailerStart));
  if (!header.includes("%PDF-") || !trailer.includes("%%EOF")) {
    throw new CodedApiError("FILE_INVALID_CONTENT");
  }
}

async function readUpload(file: File) {
  if (file.size < 1) throw new CodedApiError("FILE_EMPTY");
  if (file.size > uploadLimitBytes()) throw new CodedApiError("FILE_TOO_LARGE");
  return new Uint8Array(await file.arrayBuffer());
}

function createTextState(source: string) {
  const document = new Y.Doc();
  try {
    if (source) document.getText("markdown").insert(0, source);
    return Y.encodeStateAsUpdate(document);
  } finally {
    document.destroy();
  }
}

function createCanvasState(source: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new CodedApiError("FILE_INVALID_CONTENT");
  }
  if (!parsed || typeof parsed !== "object") throw new CodedApiError("FILE_INVALID_CONTENT");
  const file = parsed as {
    type?: unknown;
    elements?: unknown;
    files?: unknown;
    appState?: { viewBackgroundColor?: unknown };
  };
  if (file.type !== "excalidraw" || !Array.isArray(file.elements)) {
    throw new CodedApiError("FILE_INVALID_CONTENT");
  }
  const elements = new Map<string, unknown>();
  for (const element of file.elements) {
    if (!element || typeof element !== "object" || typeof (element as { id?: unknown }).id !== "string") {
      throw new CodedApiError("FILE_INVALID_CONTENT");
    }
    const id = (element as { id: string }).id;
    if (!id || elements.has(id)) throw new CodedApiError("FILE_INVALID_CONTENT");
    elements.set(id, JSON.parse(JSON.stringify(element)));
  }
  if (file.files !== undefined && (!file.files || typeof file.files !== "object" || Array.isArray(file.files))) {
    throw new CodedApiError("FILE_INVALID_CONTENT");
  }
  const document = new Y.Doc();
  try {
    const elementsMap = document.getMap<unknown>("canvas-elements");
    const filesMap = document.getMap<unknown>("canvas-files");
    const settingsMap = document.getMap<unknown>("canvas-settings");
    for (const [id, element] of elements) elementsMap.set(id, element);
    for (const [id, value] of Object.entries(file.files || {})) {
      filesMap.set(id, JSON.parse(JSON.stringify(value)));
    }
    const background = file.appState?.viewBackgroundColor;
    settingsMap.set(
      "viewBackgroundColor",
      typeof background === "string" && background.length <= 64 ? background : "#fbfaf7",
    );
    return Y.encodeStateAsUpdate(document);
  } finally {
    document.destroy();
  }
}

function decodeUtf8(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new CodedApiError("FILE_INVALID_CONTENT");
  }
}

function fileExtension(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

function cleanFileName(name: string) {
  const leaf = name.replace(/\\/g, "/").split("/").pop()?.trim() || "file";
  return leaf.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "file";
}
