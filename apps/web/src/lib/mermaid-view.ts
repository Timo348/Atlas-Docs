export type MermaidView = "diagram" | "source-and-diagram";

export function mermaidViewForDefaultEditorView(defaultEditorView: "write" | "preview"): MermaidView {
  return defaultEditorView === "preview" ? "diagram" : "source-and-diagram";
}
