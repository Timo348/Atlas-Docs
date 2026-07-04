"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { BookOpen, KeyRound } from "lucide-react";
import type { AuthMode } from "@/lib/auth";

export function SignInForm({ mode }: { mode: AuthMode }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });
    if (result?.ok) window.location.href = "/";
    else {
      setError("The email address or password is incorrect.");
      setLoading(false);
    }
  }

  return (
    <main className="signin-page">
      <section className="signin-story">
        <div className="brand brand-light"><BookOpen size={22} /> Atlas</div>
        <div>
          <p className="eyebrow">Knowledge that keeps moving</p>
          <h1>Write. Think.<br />See together.</h1>
          <p className="story-copy">Markdown documents and visual sketches in one collaborative workspace.</p>
        </div>
        <p className="quote">“Good documentation is a conversation that does not get lost.”</p>
      </section>
      <section className="signin-panel">
        <div className="signin-card">
          <span className="signin-icon"><KeyRound size={21} /></span>
          <p className="eyebrow dark">Welcome back</p>
          <h2>Sign in to Atlas</h2>
          {(mode === "oidc" || mode === "both") && (
            <button className="button oidc-button" onClick={() => signIn("authentik", { callbackUrl: "/" })}>
              Continue with Authentik
            </button>
          )}
          {mode === "both" && <div className="divider"><span>or use a local account</span></div>}
          {(mode === "local" || mode === "both") && (
            <form onSubmit={submit}>
              <label>Email<input name="email" type="email" autoComplete="email" required /></label>
              <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
              {error && <p className="form-error">{error}</p>}
              <button className="button primary-button" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
