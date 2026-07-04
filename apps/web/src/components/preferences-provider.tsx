"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Preferences } from "@/lib/preferences";

type PreferencesContextValue = {
  preferences: Preferences;
  setPreferences: (preferences: Preferences) => void;
  text: (english: string, german: string) => string;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({
  initial,
  children,
}: {
  initial: Preferences;
  children: React.ReactNode;
}) {
  const [preferences, setPreferences] = useState(initial);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.lang = preferences.language;
      root.dataset.theme = preferences.colorTheme;
      root.dataset.uiFont = preferences.uiFont;
      root.dataset.editorFont = preferences.editorFont;
      root.dataset.fontSize = preferences.fontSize;
      root.dataset.compact = String(preferences.compactMode);
    };
    apply();
    const observer = new MutationObserver(() => {
      if (root.lang !== preferences.language) apply();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [preferences]);

  const value = useMemo<PreferencesContextValue>(() => ({
    preferences,
    setPreferences,
    text: (english, german) => preferences.language === "de" ? german : english,
  }), [preferences]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}
