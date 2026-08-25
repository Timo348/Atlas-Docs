import type { PublicShareAccess } from "@/lib/public-share";
import { publicShareResourceBase } from "@/lib/public-share";

export function sharedPageAttachmentUrl(source: string | undefined, pageId: string, share: PublicShareAccess) {
  if (!source) return source;
  const match = source.match(new RegExp(`^/api/pages/${escapeRegularExpression(pageId)}/attachments/([a-zA-Z0-9_-]+)(\\?[^#]*)?(#.*)?$`));
  if (!match) return source;
  return `${publicShareResourceBase(share, pageId)}/attachments/${match[1]}${match[2] || ""}${match[3] || ""}`;
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
