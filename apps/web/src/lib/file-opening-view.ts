import type { MermaidView } from "@/lib/mermaid-view";
import type { Preferences } from "@/lib/preferences";

export type AtlasPageFormat = "MARKDOWN" | "ATLASDOC" | "LATEX" | "CANVAS" | "MERMAID" | "GANTT" | "TODO" | "TEXT" | "FILE";
export type InitialEditorTab = "write" | "preview" | "canvas" | "todo" | "atlasdoc" | MermaidView;

export function initialEditorTab(
  format: AtlasPageFormat,
  preferences: Preferences,
  publicPermission?: "VIEW" | "EDIT",
): InitialEditorTab {
  if (format === "CANVAS") return "canvas";
  if (format === "TODO") return "todo";
  if (format === "ATLASDOC") return "atlasdoc";
  if (format === "TEXT") return "write";
  if (format === "FILE") return "write";
  if (format === "MERMAID") return preferences.fileViewDefaults.mermaid;
  // The Gantt editor now has one intentional planner-only view. Keep the
  // stored legacy preference readable without letting it select a removed UI.
  if (format === "GANTT") return "diagram";
  if (publicPermission === "VIEW") return "preview";
  return format === "LATEX" ? preferences.fileViewDefaults.latex : preferences.fileViewDefaults.markdown;
}
