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
      setError("E-Mail oder Passwort ist falsch.");
      setLoading(false);
    }
  }

  return (
    <main className="signin-page">
      <section className="signin-story">
        <div className="brand brand-light"><BookOpen size={22} /> Atlas</div>
        <div>
          <p className="eyebrow">Wissen, das in Bewegung bleibt</p>
          <h1>Schreiben. Denken.<br />Gemeinsam sehen.</h1>
          <p className="story-copy">Markdown-Dokumente und visuelle Skizzen in einem lebendigen Arbeitsraum.</p>
        </div>
        <p className="quote">„Gute Dokumentation ist ein Gespräch, das nicht verloren geht.“</p>
      </section>
      <section className="signin-panel">
        <div className="signin-card">
          <span className="signin-icon"><KeyRound size={21} /></span>
          <p className="eyebrow dark">Willkommen zurück</p>
          <h2>Bei Atlas anmelden</h2>
          {(mode === "oidc" || mode === "both") && (
            <button className="button oidc-button" onClick={() => signIn("authentik", { callbackUrl: "/" })}>
              Mit Authentik fortfahren
            </button>
          )}
          {mode === "both" && <div className="divider"><span>oder lokal</span></div>}
          {(mode === "local" || mode === "both") && (
            <form onSubmit={submit}>
              <label>E-Mail<input name="email" type="email" autoComplete="email" required /></label>
              <label>Passwort<input name="password" type="password" autoComplete="current-password" required /></label>
              {error && <p className="form-error">{error}</p>}
              <button className="button primary-button" disabled={loading}>
                {loading ? "Anmeldung läuft …" : "Anmelden"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
