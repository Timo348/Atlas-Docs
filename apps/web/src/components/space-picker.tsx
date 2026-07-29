"use client";

import { BookOpen, Check, ChevronsUpDown, Plus, Search, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { spaceRoleLabel } from "@/lib/space-role";
import styles from "./space-picker.module.css";

export type SpacePickerSpace = {
  id: string;
  name: string;
  description: string | null;
  hasImage: boolean;
  imageVersion: number;
  role: "OWNER" | "EDITOR" | "VIEWER";
};

export function SidebarSpaceIdentity({
  space,
  onOpen,
}: {
  space: SpacePickerSpace | null;
  onOpen: () => void;
}) {
  const { text } = usePreferences();

  return (
    <button
      type="button"
      className={styles.sidebarIdentity}
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={text(
        `Choose space. Current space: ${space?.name || "Atlas"}`,
        `Bereich auswählen. Aktueller Bereich: ${space?.name || "Atlas"}`,
      )}
    >
      <SpaceArtwork space={space} className={styles.sidebarArtwork} />
      <span className={styles.sidebarCopy}>
        <small>{text("Current space", "Aktueller Bereich")}</small>
        <strong>{space?.name || "Atlas"}</strong>
      </span>
    </button>
  );
}

export function SpacePicker({
  spaces,
  activeSpace,
  open,
  busy,
  onOpen,
  onClose,
  onSelect,
  onCreate,
}: {
  spaces: SpacePickerSpace[];
  activeSpace: SpacePickerSpace | null;
  open: boolean;
  busy: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (spaceId: string) => void;
  onCreate: () => void;
}) {
  const { preferences, text } = usePreferences();
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const searchId = useId();
  const normalizedQuery = query.trim().toLocaleLowerCase(preferences.language);
  const matchingSpaces = spaces.filter((space) => (
    !normalizedQuery
    || space.name.toLocaleLowerCase(preferences.language).includes(normalizedQuery)
    || space.description?.toLocaleLowerCase(preferences.language).includes(normalizedQuery)
  ));

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const animationFrame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [open]);

  function close() {
    setQuery("");
    onClose();
  }

  function select(spaceId: string) {
    if (spaceId === activeSpace?.id) {
      close();
      return;
    }
    setQuery("");
    onSelect(spaceId);
  }

  function create() {
    setQuery("");
    onClose();
    onCreate();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;

    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
    )).filter((element) => !element.hasAttribute("hidden"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function focusFirstResult(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowDown") return;
    const firstResult = dialogRef.current?.querySelector<HTMLButtonElement>("[data-space-result]");
    if (!firstResult) return;
    event.preventDefault();
    firstResult.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
      >
        <SpaceArtwork space={activeSpace} className={styles.triggerArtwork} />
        <span className={styles.triggerCopy}>
          <small>{text("Choose space", "Bereich auswählen")}</small>
          <strong>{activeSpace?.name || text("No space selected", "Kein Bereich ausgewählt")}</strong>
        </span>
        <ChevronsUpDown className={styles.triggerChevron} size={17} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && close()}>
          <section
            ref={dialogRef}
            id={dialogId}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onKeyDown={handleDialogKeyDown}
          >
            <header className={styles.header}>
              <div>
                <span className={styles.kicker}>{text("Workspace navigation", "Workspace-Navigation")}</span>
                <h2 id={titleId}>{text("Choose a space", "Bereich auswählen")}</h2>
                <p id={descriptionId}>
                  {text(
                    "Search your available spaces and open the one you want to work in.",
                    "Durchsuche deine verfügbaren Bereiche und öffne den Bereich, in dem du arbeiten möchtest.",
                  )}
                </p>
              </div>
              <button type="button" className={styles.closeButton} onClick={close} aria-label={text("Close", "Schließen")}>
                <X size={19} aria-hidden="true" />
              </button>
            </header>

            <div className={styles.search}>
              <Search size={18} aria-hidden="true" />
              <label className={styles.visuallyHidden} htmlFor={searchId}>
                {text("Search spaces", "Bereiche durchsuchen")}
              </label>
              <input
                ref={searchRef}
                id={searchId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={focusFirstResult}
                placeholder={text("Search by name or description…", "Nach Name oder Beschreibung suchen…")}
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label={text("Clear search", "Suche leeren")}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className={styles.resultSummary} aria-live="polite">
              <span>
                {matchingSpaces.length === 1
                  ? text("1 space", "1 Bereich")
                  : text(`${matchingSpaces.length} spaces`, `${matchingSpaces.length} Bereiche`)}
              </span>
              {normalizedQuery && <small>{text("Search results", "Suchergebnisse")}</small>}
            </div>

            <ul className={styles.results}>
              {matchingSpaces.map((space) => {
                const selected = space.id === activeSpace?.id;
                return (
                  <li key={space.id}>
                    <button
                      type="button"
                      data-space-result
                      className={selected ? styles.selectedResult : undefined}
                      onClick={() => select(space.id)}
                      aria-pressed={selected}
                    >
                      <SpaceArtwork space={space} className={styles.resultArtwork} />
                      <span className={styles.resultCopy}>
                        <strong>{space.name}</strong>
                        <small>{space.description || spaceRoleLabel(space.role, preferences.language)}</small>
                      </span>
                      <span className={styles.resultRole}>{spaceRoleLabel(space.role, preferences.language)}</span>
                      {selected && (
                        <span className={styles.selectedMark} aria-label={text("Currently selected", "Aktuell ausgewählt")}>
                          <Check size={16} aria-hidden="true" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              {!matchingSpaces.length && (
                <li className={styles.emptyResult}>
                  <Search size={24} aria-hidden="true" />
                  <strong>{text("No space found", "Kein Bereich gefunden")}</strong>
                  <span>{text("Try a different search term.", "Versuche einen anderen Suchbegriff.")}</span>
                </li>
              )}
            </ul>

            <footer className={styles.footer}>
              <span>{text("Only spaces you can access are shown.", "Es werden nur Bereiche angezeigt, auf die du zugreifen kannst.")}</span>
              <button type="button" disabled={busy} onClick={create}>
                <Plus size={16} aria-hidden="true" />
                {text("Create new space", "Neuen Bereich anlegen")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

function SpaceArtwork({ space, className }: { space: SpacePickerSpace | null; className: string }) {
  return (
    <span className={className} aria-hidden="true">
      {space?.hasImage
        ? <img src={`/api/spaces/${space.id}/image?v=${space.imageVersion}`} alt="" />
        : <BookOpen size={18} />}
    </span>
  );
}
