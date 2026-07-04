export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function detectImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  if (
    bytes.length >= 6
    && (String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a"
      || String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a")
  ) return "image/gif";
  return null;
}

export async function readValidatedImage(file: File) {
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Das Bild darf maximal 5 MB groß sein.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectImageMime(bytes);
  if (!mime) throw new Error("Only valid PNG, JPEG, WebP, and GIF images are allowed.");
  return { bytes, mime };
}
