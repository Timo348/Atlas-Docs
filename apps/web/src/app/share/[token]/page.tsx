import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { PreferencesProvider } from "@/components/preferences-provider";
import { SharedPageClient } from "@/components/shared-page-client";
import { activePageShare } from "@/lib/page-share-server";
import { DEFAULT_PREFERENCES, resolveLanguage } from "@/lib/preferences";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shared page · Atlas Docs",
  description: "A page shared from Atlas Docs.",
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SharedPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const [share, cookieStore, requestHeaders] = await Promise.all([
    activePageShare(token),
    cookies(),
    headers(),
  ]);
  if (!share) notFound();
  const language = resolveLanguage(
    cookieStore.get("atlas-language")?.value,
    requestHeaders.get("accept-language"),
  );
  return (
    <PreferencesProvider initial={{ ...DEFAULT_PREFERENCES, language }}>
      <SharedPageClient
        page={{
          id: share.page.id,
          title: share.page.title,
          slug: share.page.slug,
          parentId: null,
          format: share.page.format,
        }}
        token={token}
        permission={share.permission}
        shareId={share.id}
      />
    </PreferencesProvider>
  );
}
