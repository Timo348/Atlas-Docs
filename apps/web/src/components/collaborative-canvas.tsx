"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
import type * as Y from "yjs";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((module) => module.Excalidraw),
  { ssr: false, loading: () => <div className="canvas-loading">Canvas wird geladen …</div> },
);

type ExcalidrawApi = {
  updateScene: (scene: { elements?: readonly unknown[]; appState?: Record<string, unknown> }) => void;
  addFiles: (files: unknown[]) => void;
};

export function CollaborativeCanvas({ ydoc, readOnly }: { ydoc: Y.Doc; readOnly: boolean }) {
  const elementsMap = useMemo(() => ydoc.getMap<unknown>("canvas-elements"), [ydoc]);
  const filesMap = useMemo(() => ydoc.getMap<unknown>("canvas-files"), [ydoc]);
  const settingsMap = useMemo(() => ydoc.getMap<unknown>("canvas-settings"), [ydoc]);
  const api = useRef<ExcalidrawApi | null>(null);

  useEffect(() => {
    const syncElements = (_event: unknown, transaction: Y.Transaction) => {
      if (transaction.origin === "canvas-local") return;
      api.current?.updateScene({
        elements: Array.from(elementsMap.values()) as readonly unknown[],
        appState: { viewBackgroundColor: settingsMap.get("viewBackgroundColor") || "#fbfaf7" },
      });
    };
    const syncFiles = (_event: unknown, transaction: Y.Transaction) => {
      if (transaction.origin === "canvas-local") return;
      api.current?.addFiles(Array.from(filesMap.values()));
    };
    elementsMap.observe(syncElements);
    settingsMap.observe(syncElements);
    filesMap.observe(syncFiles);
    return () => {
      elementsMap.unobserve(syncElements);
      settingsMap.unobserve(syncElements);
      filesMap.unobserve(syncFiles);
    };
  }, [elementsMap, filesMap, settingsMap]);

  return (
    <div className="canvas-wrap">
      <Excalidraw
        excalidrawAPI={(nextApi) => {
          api.current = nextApi as unknown as ExcalidrawApi;
          nextApi.addFiles(Array.from(filesMap.values()) as never[]);
        }}
        initialData={{
          elements: Array.from(elementsMap.values()) as never[],
          files: Object.fromEntries(Array.from(filesMap.entries())) as never,
          appState: {
            viewBackgroundColor: (settingsMap.get("viewBackgroundColor") as string) || "#fbfaf7",
          },
        }}
        viewModeEnabled={readOnly}
        onChange={(elements, appState, files) => {
          if (readOnly) return;
          ydoc.transact(() => {
            for (const element of elements) {
              const previous = elementsMap.get(element.id);
              if (JSON.stringify(previous) !== JSON.stringify(element)) {
                elementsMap.set(element.id, JSON.parse(JSON.stringify(element)));
              }
            }
            for (const [id, file] of Object.entries(files)) {
              if (!filesMap.has(id)) filesMap.set(id, JSON.parse(JSON.stringify(file)));
            }
            if (settingsMap.get("viewBackgroundColor") !== appState.viewBackgroundColor) {
              settingsMap.set("viewBackgroundColor", appState.viewBackgroundColor);
            }
          }, "canvas-local");
        }}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
      />
    </div>
  );
}
