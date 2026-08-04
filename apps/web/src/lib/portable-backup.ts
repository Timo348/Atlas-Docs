import { posix } from "node:path";
import * as Y from "yjs";

export type ExportScope = "accessible" | "instance";
export type PortableFolder = { id: string; name: string; parentId: string | null; sortOrder: number };
export type PortablePage = {
  id: string;
  title: string;
  slug: string;
  folderId: string | null;
  parentId: string | null;
  format: "MARKDOWN" | "LATEX";
  sortOrder: number;
};
export type PortableSpace = {
  id: string;
  name: string;
  slug: string;
  folders: PortableFolder[];
  pages: PortablePage[];
};
export type PortablePageLayout = {
  sourcePath: string;
  canvasPath: string;
  assetsDirectory: string;
  relativeAssetsDirectory: string;
};
export type PortableLayout = {
  spacePaths: Map<string, string>;
  folderPaths: Map<string, string>;
  pagePaths: Map<string, PortablePageLayout>;
};
export type PageImageMetadata = { id: string; mime: string };

export function canUseExportScope(role: string, scope: ExportScope) {
  return scope === "accessible" || role === "ADMIN";
}

export function sanitizePathSegment(value: string, fallback = "item") {
  const segment = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  const safe = segment || fallback;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `${safe}-item` : safe;
}

export function buildPortableLayout(spaces: PortableSpace[]): PortableLayout {
  const spacePaths = new Map<string, string>();
  const folderPaths = new Map<string, string>();
  const pagePaths = new Map<string, PortablePageLayout>();
  const usedSpaces = new Set<string>();

  for (const space of spaces) {
    const spaceSegment = uniqueSegment(sanitizePathSegment(space.slug, "space"), space.id, usedSpaces);
    const spacePath = posix.join("spaces", spaceSegment);
    spacePaths.set(space.id, spacePath);

    const folderById = new Map(space.folders.map((folder) => [folder.id, folder]));
    const folderSegments = new Map<string, string>();
    const usedFolderSegments = new Map<string, Set<string>>();
    for (const folder of [...space.folders].sort(sortFolders)) {
      const parentKey = folder.parentId || "root";
      const used = usedFolderSegments.get(parentKey) || new Set<string>();
      usedFolderSegments.set(parentKey, used);
      folderSegments.set(folder.id, uniqueSegment(sanitizePathSegment(folder.name, "folder"), folder.id, used));
    }

    const resolveFolderPath = (folderId: string, trail = new Set<string>()): string => {
      const existing = folderPaths.get(folderId);
      if (existing) return existing;
      const folder = folderById.get(folderId);
      if (!folder || trail.has(folderId)) return spacePath;
      const nextTrail = new Set(trail).add(folderId);
      const parentPath = folder.parentId && folderById.has(folder.parentId)
        ? resolveFolderPath(folder.parentId, nextTrail)
        : spacePath;
      const path = posix.join(parentPath, folderSegments.get(folder.id) || "folder");
      folderPaths.set(folder.id, path);
      return path;
    };

    for (const folder of space.folders) resolveFolderPath(folder.id);

    const usedPageSegments = new Map<string, Set<string>>();
    for (const page of [...space.pages].sort(sortPages)) {
      const directory = page.folderId ? (folderPaths.get(page.folderId) || spacePath) : spacePath;
      const used = usedPageSegments.get(directory) || new Set<string>();
      usedPageSegments.set(directory, used);
      const segment = uniqueSegment(sanitizePathSegment(page.slug, "page"), page.id, used);
      const base = posix.join(directory, segment);
      pagePaths.set(page.id, {
        sourcePath: `${base}.${page.format === "LATEX" ? "tex" : "md"}`,
        canvasPath: `${base}.excalidraw`,
        assetsDirectory: `${base}.assets`,
        relativeAssetsDirectory: `${segment}.assets`,
      });
    }
  }

  return { spacePaths, folderPaths, pagePaths };
}

export function decodeCollaborationDocument(data: Uint8Array | null) {
  const document = new Y.Doc();
  try {
    if (data?.byteLength) Y.applyUpdate(document, data);
    const source = document.getText("markdown").toString();
    const elements = Array.from(document.getMap<unknown>("canvas-elements").values());
    const files = Object.fromEntries(document.getMap<unknown>("canvas-files").entries());
    const settings = document.getMap<unknown>("canvas-settings");
    const hasCanvas = elements.length > 0 || Object.keys(files).length > 0 || settings.size > 0;
    return {
      source,
      canvas: hasCanvas ? {
        type: "excalidraw",
        version: 2,
        source: "https://github.com/Timo348/Atlas-Docs",
        elements,
        appState: {
          viewBackgroundColor: settings.get("viewBackgroundColor") || "#fbfaf7",
        },
        files,
      } : null,
    };
  } finally {
    document.destroy();
  }
}

export function rewriteImageReferences(
  source: string,
  pageId: string,
  relativeAssetsDirectory: string,
  images: PageImageMetadata[],
) {
  const available = new Map(images.map((image) => [image.id, image]));
  const referencedImageIds = new Set<string>();
  const escapedPageId = escapeRegularExpression(pageId);
  const pattern = new RegExp(
    `(?:https?:\\/\\/[^\\s/)<>'\"]+)?\\/api\\/pages\\/${escapedPageId}\\/images\\/([a-zA-Z0-9_-]+)(?:\\?[^\\s)<>'\"]*)?`,
    "g",
  );
  const rewritten = source.replace(pattern, (original, imageId: string) => {
    const image = available.get(imageId);
    if (!image) return original;
    referencedImageIds.add(imageId);
    return `./${relativeAssetsDirectory}/${imageId}.${imageExtension(image.mime)}`;
  });
  return { source: rewritten, referencedImageIds: Array.from(referencedImageIds) };
}

export function imageExtension(mime: string) {
  switch (mime) {
    case "image/png": return "png";
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    default: return "bin";
  }
}

function uniqueSegment(base: string, id: string, used: Set<string>) {
  let value = base;
  if (used.has(value)) value = `${base}-${sanitizePathSegment(id.slice(-8), "id")}`;
  let counter = 2;
  while (used.has(value)) {
    value = `${base}-${counter}`;
    counter += 1;
  }
  used.add(value);
  return value;
}

function sortFolders(left: PortableFolder, right: PortableFolder) {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function sortPages(left: PortablePage, right: PortablePage) {
  return left.sortOrder - right.sortOrder || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
