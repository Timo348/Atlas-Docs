"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { BookOpen, KeyRound } from "lucide-react";
import type { AuthMode } from "@/lib/auth";

export function SignInForm({ mode, language }: { mode: AuthMode; language: "en" | "de" }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const text = (english: string, german: string) => language === "de" ? german : english;

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

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
      setError(text(
        "The email address or password is incorrect.",
        "Die E-Mail-Adresse oder das Passwort ist falsch.",
      ));
      setLoading(false);
    }
  }

  return (
    <main className="signin-page">
      <section className="signin-story">
        <div className="brand brand-light"><BookOpen size={22} /> Atlas</div>
        <div>
          <p className="eyebrow">{text("Knowledge that keeps moving", "Wissen, das in Bewegung bleibt")}</p>
          <h1>{text("Write. Think.", "Schreiben. Denken.")}<br />{text("See together.", "Gemeinsam sehen.")}</h1>
          <p className="story-copy">{text(
            "Markdown documents and visual sketches in one collaborative workspace.",
            "Markdown-Dokumente und visuelle Skizzen in einem gemeinsamen Workspace.",
          )}</p>
        </div>
        <p className="quote">{text(
          "“Good documentation is a conversation that does not get lost.”",
          "„Gute Dokumentation ist ein Gespräch, das nicht verloren geht.“",
        )}</p>
      </section>
      <section className="signin-panel">
        <div className="signin-card">
          <span className="signin-icon"><KeyRound size={21} /></span>
          <p className="eyebrow dark">{text("Welcome back", "Willkommen zurück")}</p>
          <h2>{text("Sign in to Atlas", "Bei Atlas anmelden")}</h2>
          {(mode === "oidc" || mode === "both") && (
            <button className="button oidc-button" onClick={() => signIn("authentik", { callbackUrl: "/" })}>
              {text("Continue with Authentik", "Mit Authentik fortfahren")}
            </button>
          )}
          {mode === "both" && <div className="divider"><span>{text("or use a local account", "oder ein lokales Konto verwenden")}</span></div>}
          {(mode === "local" || mode === "both") && (
            <form onSubmit={submit}>
              <label>{text("Email", "E-Mail")}<input name="email" type="email" autoComplete="email" required /></label>
              <label>{text("Password", "Passwort")}<input name="password" type="password" autoComplete="current-password" required /></label>
              {error && <p className="form-error">{error}</p>}
              <button className="button primary-button" disabled={loading}>
                {loading ? text("Signing in…", "Anmeldung läuft…") : text("Sign in", "Anmelden")}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
