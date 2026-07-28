export const EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

type ExcalidrawAssetTarget = {
  EXCALIDRAW_ASSET_PATH?: string;
};

export function configureExcalidrawAssets(target: object) {
  (target as ExcalidrawAssetTarget).EXCALIDRAW_ASSET_PATH = EXCALIDRAW_ASSET_PATH;
}
