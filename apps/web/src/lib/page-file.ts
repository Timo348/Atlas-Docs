export const MAX_IMPORTED_FILE_BYTES = 25 * 1024 * 1024;

export type AtlasPageFormat = "MARKDOWN" | "LATEX" | "CANVAS" | "MERMAID" | "GANTT" | "TODO" | "TEXT" | "FILE";

export function isPlainTextImportName(name: string) {
  const extension = fileExtension(name);
  return extension === "" || extension === ".txt";
}

export function isMermaidImportName(name: string) {
  const extension = fileExtension(name);
  return extension === ".mmd" || extension === ".mermaid";
}

export function isGanttImportName(name: string) {
  return fileExtension(name) === ".gantt";
}

export function fileExtension(name: string) {
  const baseName = name.replace(/\\/g, "/").split("/").pop() || "";
  const dot = baseName.lastIndexOf(".");
  return dot > 0 && dot < baseName.length - 1 ? baseName.slice(dot).toLowerCase() : "";
}

export function downloadableFileName(title: string, format: AtlasPageFormat) {
  if (format === "TEXT" || format === "FILE") return title;
  const extension = format === "LATEX" ? ".tex" : format === "CANVAS" ? ".excalidraw" : format === "MERMAID" ? ".mmd" : format === "GANTT" ? ".gantt" : format === "TODO" ? ".todos.json" : ".md";
  if (format === "MERMAID" && (title.toLowerCase().endsWith(".mmd") || title.toLowerCase().endsWith(".mermaid"))) return title;
  if (format === "GANTT" && title.toLowerCase().endsWith(".gantt")) return title;
  if (format === "TODO" && title.toLowerCase().endsWith(".todos.json")) return title;
  return title.toLowerCase().endsWith(extension) ? title : `${title}${extension}`;
}

export function portableExtension(title: string, format: AtlasPageFormat) {
  if (format === "TEXT") return fileExtension(title) === ".txt" ? ".txt" : "";
  if (format === "FILE") return fileExtension(title);
  if (format === "LATEX") return ".tex";
  if (format === "CANVAS") return ".excalidraw";
  if (format === "MERMAID") {
    const extension = fileExtension(title);
    return extension === ".mmd" || extension === ".mermaid" ? extension : ".mmd";
  }
  if (format === "GANTT") return ".gantt";
  if (format === "TODO") return ".todos.json";
  return ".md";
}

export function safeDownloadName(value: string) {
  return value.replace(/[\\/\r\n"]/g, "_") || "download";
}
