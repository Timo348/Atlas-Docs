"use client";

import { useEffect, useRef } from "react";

export type DialogEscapeEntry = {
  token: symbol;
  readonly blocked: boolean;
  close: () => void;
};

export type DialogEscapeState = {
  key: string;
  defaultPrevented: boolean;
  isComposing: boolean;
};

export type DialogEscapeDecision = "ignore" | "block" | "dismiss";
export type DialogEscapeEvent = DialogEscapeState & {
  preventDefault: () => void;
  stopImmediatePropagation: () => void;
};

export function createDialogEscapeStack() {
  const entries: DialogEscapeEntry[] = [];

  return {
    activate(entry: DialogEscapeEntry) {
      const existing = entries.findIndex((candidate) => candidate.token === entry.token);
      if (existing >= 0) {
        entries[existing] = entry;
        return;
      }
      entries.push(entry);
    },
    deactivate(token: symbol) {
      const index = entries.findIndex((candidate) => candidate.token === token);
      if (index >= 0) entries.splice(index, 1);
    },
    top() {
      return entries.at(-1) || null;
    },
    size() {
      return entries.length;
    },
  };
}

export function dialogEscapeDecision(
  top: Pick<DialogEscapeEntry, "blocked"> | null,
  state: DialogEscapeState,
): DialogEscapeDecision {
  if (state.key !== "Escape" || state.defaultPrevented || state.isComposing || !top) return "ignore";
  return top.blocked ? "block" : "dismiss";
}

export function escapeDismissesDialog(
  key: string,
  blocked: boolean,
  isComposing = false,
  defaultPrevented = false,
) {
  return dialogEscapeDecision(
    { blocked },
    { key, defaultPrevented, isComposing },
  ) === "dismiss";
}

export function dispatchDialogEscape(
  stack: Pick<ReturnType<typeof createDialogEscapeStack>, "top">,
  event: DialogEscapeEvent,
) {
  const top = stack.top();
  const decision = dialogEscapeDecision(top, event);
  if (decision === "ignore") return decision;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (decision === "dismiss") top?.close();
  return decision;
}

const activeDialogs = createDialogEscapeStack();
let listening = false;

function handleKeyDown(event: KeyboardEvent) {
  dispatchDialogEscape(activeDialogs, event);
}

function syncDocumentListener() {
  if (typeof document === "undefined") return;
  if (activeDialogs.size() > 0 && !listening) {
    document.addEventListener("keydown", handleKeyDown);
    listening = true;
  } else if (activeDialogs.size() === 0 && listening) {
    document.removeEventListener("keydown", handleKeyDown);
    listening = false;
  }
}

export function useDialogEscape(onClose: () => void, blocked = false, active = true) {
  const closeRef = useRef(onClose);
  const blockedRef = useRef(blocked);
  const entryRef = useRef<DialogEscapeEntry | null>(null);
  closeRef.current = onClose;
  blockedRef.current = blocked;

  if (!entryRef.current) {
    entryRef.current = {
      token: Symbol("dialog-escape"),
      get blocked() {
        return blockedRef.current;
      },
      close() {
        closeRef.current();
      },
    };
  }

  useEffect(() => {
    if (!active) return;
    const entry = entryRef.current;
    if (!entry) return;

    activeDialogs.activate(entry);
    syncDocumentListener();
    return () => {
      activeDialogs.deactivate(entry.token);
      syncDocumentListener();
    };
  }, [active]);
}
