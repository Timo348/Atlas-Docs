import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { cookies, headers } from "next/headers";
import { authOptions, getAuthMode } from "@/lib/auth";
import { SignInForm } from "@/components/signin-form";
import { resolveLanguage } from "@/lib/preferences";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.active) redirect("/");
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const language = resolveLanguage(
    cookieStore.get("atlas-language")?.value,
    requestHeaders.get("accept-language"),
  );
  return <SignInForm mode={getAuthMode()} language={language} />;
}
