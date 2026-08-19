export type PublicShareAccess = {
  kind: "page" | "folder";
  token: string;
  permission: "VIEW" | "EDIT";
};

export function publicShareResourceBase(share: PublicShareAccess, pageId: string) {
  const token = encodeURIComponent(share.token);
  return share.kind === "folder"
    ? `/api/public/folder-shares/${token}/pages/${encodeURIComponent(pageId)}`
    : `/api/public/shares/${token}`;
}
