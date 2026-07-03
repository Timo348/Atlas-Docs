import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, getAuthMode } from "@/lib/auth";
import { SignInForm } from "@/components/signin-form";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.active) redirect("/");
  return <SignInForm mode={getAuthMode()} />;
}
