export function sharedPageImageUrl(source: string | Blob | undefined, pageId: string, token: string) {
  if (typeof source !== "string" || !source) return source;
  const prefix = `/api/pages/${encodeURIComponent(pageId)}/images/`;
  if (!source.startsWith(prefix)) return source;
  const imageId = source.slice(prefix.length).split(/[?#]/, 1)[0];
  if (!imageId) return source;
  return `/api/public/shares/${encodeURIComponent(token)}/images/${encodeURIComponent(imageId)}`;
}
