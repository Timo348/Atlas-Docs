import type { PublicShareAccess } from "@/lib/public-share";
import { publicShareResourceBase } from "@/lib/public-share";

export function sharedPageImageUrl(source: string | Blob | undefined, pageId: string, share: PublicShareAccess) {
  if (typeof source !== "string" || !source) return source;
  const prefix = `/api/pages/${encodeURIComponent(pageId)}/images/`;
  if (!source.startsWith(prefix)) return source;
  const imageId = source.slice(prefix.length).split(/[?#]/, 1)[0];
  if (!imageId) return source;
  return `${publicShareResourceBase(share, pageId)}/images/${encodeURIComponent(imageId)}`;
}
