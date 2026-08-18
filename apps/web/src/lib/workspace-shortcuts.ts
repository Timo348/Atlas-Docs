export type WorkspaceShortcutEvent = {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  isComposing: boolean;
  repeat: boolean;
};

export type WorkspaceShortcut = "new-file" | "switch-space";

export function workspaceShortcut(event: WorkspaceShortcutEvent): WorkspaceShortcut | null {
  if (
    event.defaultPrevented
    || event.isComposing
    || event.repeat
    || event.altKey
    || !event.shiftKey
    || (!event.ctrlKey && !event.metaKey)
  ) return null;

  if (event.key.toLowerCase() === "n") return "new-file";
  if (event.key.toLowerCase() === "k") return "switch-space";
  return null;
}
