export type FilePreviewKind = "pdf" | "image" | "audio" | "video";

/**
 * Browser-native previews are deliberately limited to media formats that can
 * be displayed without executing uploaded document content in the Atlas app.
 */
export function filePreviewKind(mime: string | null | undefined): FilePreviewKind | null {
  const normalized = mime?.split(";", 1)[0]?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "application/pdf") return "pdf";
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("video/")) return "video";
  return null;
}
