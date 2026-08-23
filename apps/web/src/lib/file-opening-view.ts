import type { MermaidView } from "@/lib/mermaid-view";
import type { Preferences } from "@/lib/preferences";

export type AtlasPageFormat = "MARKDOWN" | "LATEX" | "CANVAS" | "MERMAID" | "GANTT" | "TODO" | "TEXT" | "FILE";
export type InitialEditorTab = "write" | "preview" | "canvas" | "todo" | MermaidView;

export function initialEditorTab(
  format: AtlasPageFormat,
  preferences: Preferences,
  publicPermission?: "VIEW" | "EDIT",
): InitialEditorTab {
  if (format === "CANVAS") return "canvas";
  if (format === "TODO") return "todo";
  if (format === "TEXT") return "write";
  if (format === "FILE") return "write";
  if (format === "MERMAID") return preferences.fileViewDefaults.mermaid;
  if (format === "GANTT") return preferences.fileViewDefaults.gantt;
  if (publicPermission === "VIEW") return "preview";
  return format === "LATEX" ? preferences.fileViewDefaults.latex : preferences.fileViewDefaults.markdown;
}
