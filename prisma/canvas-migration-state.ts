import * as Y from "yjs";

export const CANVAS_MIGRATION_VERSION = 1;
export const DEFAULT_CANVAS_BACKGROUND = "#fbfaf7";
const CANVAS_MAP_NAMES = ["canvas-elements", "canvas-files", "canvas-settings"] as const;

export type ExtractedCanvasState = {
  hasContent: boolean;
  state: Uint8Array;
};

export class CanvasStateDecodeError extends Error {
  constructor(cause: unknown) {
    super("The stored Yjs canvas state could not be decoded.", { cause });
    this.name = "CanvasStateDecodeError";
  }
}

export function extractCanvasState(data: Uint8Array | null | undefined): ExtractedCanvasState {
  const source = new Y.Doc();
  const target = new Y.Doc();
  try {
    if (data?.byteLength) Y.applyUpdate(source, data);

    for (const name of CANVAS_MAP_NAMES) {
      const sourceMap = source.getMap<unknown>(name);
      const targetMap = target.getMap<unknown>(name);
      for (const [key, value] of sourceMap.entries()) targetMap.set(key, clone(value));
    }

    const sourceElements = source.getMap<unknown>("canvas-elements");
    const background = source.getMap<unknown>("canvas-settings").get("viewBackgroundColor");
    const hasVisibleElement = Array.from(sourceElements.values()).some((element) => (
      !element
      || typeof element !== "object"
      || (element as { isDeleted?: unknown }).isDeleted !== true
    ));
    const hasCustomBackground = typeof background === "string"
      && background.toLowerCase() !== DEFAULT_CANVAS_BACKGROUND;

    const targetSettings = target.getMap<unknown>("canvas-settings");
    if (!targetSettings.has("viewBackgroundColor")) {
      targetSettings.set("viewBackgroundColor", DEFAULT_CANVAS_BACKGROUND);
    }

    return {
      hasContent: hasVisibleElement || hasCustomBackground,
      state: Y.encodeStateAsUpdate(target),
    };
  } catch (error) {
    throw error instanceof CanvasStateDecodeError ? error : new CanvasStateDecodeError(error);
  } finally {
    source.destroy();
    target.destroy();
  }
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}
