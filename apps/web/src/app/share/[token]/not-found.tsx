import Link from "next/link";
import { cookies, headers } from "next/headers";
import { resolveLanguage } from "@/lib/preferences";

export default async function SharedPageNotFound() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const german = resolveLanguage(
    cookieStore.get("atlas-language")?.value,
    requestHeaders.get("accept-language"),
  ) === "de";
  return (
    <main className="shared-page-unavailable">
      <span>Atlas Docs</span>
      <h1>{german ? "Diese geteilte Seite ist nicht verfügbar." : "This shared page is unavailable."}</h1>
      <p>{german ? "Der Link ist ungültig, abgelaufen oder wurde widerrufen." : "The link is invalid, expired, or has been revoked by its owner."}</p>
      <Link className="button primary-button" href="/signin">{german ? "Atlas Docs öffnen" : "Open Atlas Docs"}</Link>
    </main>
  );
}
