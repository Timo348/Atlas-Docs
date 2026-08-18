import { z } from "zod";

export const preferencesSchema = z.object({
  language: z.enum(["en", "de"]),
  colorTheme: z.enum(["system", "light", "dark"]),
  uiFont: z.enum(["inter", "helvetica", "serif", "system"]),
  editorFont: z.enum(["mono", "sans"]),
  fontSize: z.enum(["small", "medium", "large"]),
  defaultEditorView: z.enum(["write", "preview"]),
  compactMode: z.boolean(),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  language: "en",
  colorTheme: "system",
  uiFont: "inter",
  editorFont: "mono",
  fontSize: "medium",
  defaultEditorView: "write",
  compactMode: false,
};

export function normalizePreferences(value: Partial<Record<keyof Preferences, unknown>>): Preferences {
  const parsed = preferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
}

export function resolveLanguage(stored: unknown, acceptLanguage?: string | null): Preferences["language"] {
  if (stored === "de" || stored === "en") return stored;

  const supported = (acceptLanguage || "")
    .split(",")
    .map((entry, index) => {
      const [rawTag, ...parameters] = entry.trim().toLowerCase().split(";");
      const quality = parseLanguageQuality(parameters);
      const tag = rawTag.trim();
      return {
        index,
        quality,
        language: tag === "de" || tag.startsWith("de-")
          ? "de" as const
          : tag === "en" || tag.startsWith("en-") ? "en" as const : null,
      };
    })
    .filter((entry): entry is typeof entry & { language: Preferences["language"] } => (
      entry.language !== null && entry.quality > 0
    ))
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  return supported[0]?.language || DEFAULT_PREFERENCES.language;
}

function parseLanguageQuality(parameters: string[]) {
  const qualityParameter = parameters
    .map((parameter) => parameter.trim())
    .find((parameter) => /^q\s*=/.test(parameter));
  if (!qualityParameter) return 1;
  const match = qualityParameter.match(/^q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/);
  return match ? Number(match[1]) : 0;
}
