export type EditorHistoryAction = "undo" | "redo";

/** Shared by document surfaces; callers decide whether the focused field belongs to their history. */
export function editorHistoryAction(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  nativeEvent?: { isComposing?: boolean };
}): EditorHistoryAction | null {
  if (event.defaultPrevented || event.isComposing || event.nativeEvent?.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) return "redo";
  return null;
}
