import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { PreferencesProvider } from "@/components/preferences-provider";
import { SharedFolderClient } from "@/components/shared-folder-client";
import { activeFolderShare, folderShareContent } from "@/lib/folder-share-server";
import { DEFAULT_PREFERENCES, resolveLanguage } from "@/lib/preferences";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shared folder · Atlas Docs",
  description: "A folder shared from Atlas Docs.",
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SharedFolderPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ token }, query, cookieStore, requestHeaders] = await Promise.all([
    props.params,
    props.searchParams,
    cookies(),
    headers(),
  ]);
  const share = await activeFolderShare(token);
  if (!share) notFound();
  const content = await folderShareContent(share.folderId);
  const selectedPage = content.pages.find((page) => page.id === query.page) ?? content.pages[0] ?? null;
  const language = resolveLanguage(cookieStore.get("atlas-language")?.value, requestHeaders.get("accept-language"));
  return (
    <PreferencesProvider initial={{ ...DEFAULT_PREFERENCES, language }}>
      <SharedFolderClient
        token={token}
        shareId={share.id}
        permission={share.permission}
        rootFolderId={share.folderId}
        rootFolderName={share.folder.name}
        folders={content.folders}
        pages={content.pages}
        selectedPage={selectedPage}
      />
    </PreferencesProvider>
  );
}
