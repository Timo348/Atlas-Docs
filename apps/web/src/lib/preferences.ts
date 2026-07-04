import { z } from "zod";

export const preferencesSchema = z.object({
  language: z.enum(["en", "de"]),
  colorTheme: z.enum(["system", "light", "dark"]),
  uiFont: z.enum(["inter", "serif", "system"]),
  editorFont: z.enum(["mono", "sans"]),
  fontSize: z.enum(["small", "medium", "large"]),
  compactMode: z.boolean(),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  language: "en",
  colorTheme: "system",
  uiFont: "inter",
  editorFont: "mono",
  fontSize: "medium",
  compactMode: false,
};

export function normalizePreferences(value: Partial<Record<keyof Preferences, unknown>>): Preferences {
  const parsed = preferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
}
