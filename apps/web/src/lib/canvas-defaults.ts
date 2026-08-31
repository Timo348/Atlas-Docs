export const DEFAULT_CANVAS_BACKGROUND_COLOR = "#fbfaf7";
export const DEFAULT_CANVAS_ARROW_TYPE = "elbow" as const;

export function getCanvasInitialAppState(viewBackgroundColor: string | undefined) {
  return {
    viewBackgroundColor: viewBackgroundColor || DEFAULT_CANVAS_BACKGROUND_COLOR,
    currentItemArrowType: DEFAULT_CANVAS_ARROW_TYPE,
  };
}
