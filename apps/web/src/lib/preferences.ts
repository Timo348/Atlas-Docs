import { z } from "zod";
import type { MermaidView } from "@/lib/mermaid-view";

export const fileViewDefaultsSchema = z.object({
  markdown: z.enum(["write", "preview"]),
  latex: z.enum(["write", "preview"]),
  mermaid: z.enum(["diagram", "source-and-diagram"]),
  gantt: z.enum(["diagram", "source-and-diagram"]),
});

export type FileViewDefaults = z.infer<typeof fileViewDefaultsSchema>;

export const DEFAULT_FILE_VIEW_DEFAULTS: FileViewDefaults = {
  markdown: "write",
  latex: "write",
  mermaid: "source-and-diagram",
  // Retained only to read existing saved preferences. Gantt always opens in
  // its planner, so this value no longer controls a user-facing view.
  gantt: "diagram",
};

export function fileViewDefaultsForDefaultEditorView(defaultEditorView: "write" | "preview"): FileViewDefaults {
  return defaultEditorView === "preview"
    ? {
      markdown: "preview",
      latex: "preview",
      mermaid: "diagram",
      gantt: "diagram",
    }
    : { ...DEFAULT_FILE_VIEW_DEFAULTS, gantt: "diagram" };
}

const ganttStatusAppearanceSchema = z.object({
  // An empty label uses Atlas' localized built-in name for that state.
  label: z.string().trim().max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const ganttAppearanceSchema = z.object({
  dimPastDates: z.boolean(),
  statuses: z.object({
    none: ganttStatusAppearanceSchema,
    active: ganttStatusAppearanceSchema,
    done: ganttStatusAppearanceSchema,
    crit: ganttStatusAppearanceSchema,
  }),
});

export type GanttAppearance = z.infer<typeof ganttAppearanceSchema>;

export const DEFAULT_GANTT_APPEARANCE: GanttAppearance = {
  dimPastDates: true,
  statuses: {
    none: { label: "", color: "#3480c8" },
    active: { label: "", color: "#9b6cc4" },
    done: { label: "", color: "#2f955f" },
    crit: { label: "", color: "#cf5b4e" },
  },
};

export function copyGanttAppearance(value: GanttAppearance): GanttAppearance {
  return {
    dimPastDates: value.dimPastDates,
    statuses: {
      none: { ...value.statuses.none },
      active: { ...value.statuses.active },
      done: { ...value.statuses.done },
      crit: { ...value.statuses.crit },
    },
  };
}

export const preferencesSchema = z.object({
  language: z.enum(["en", "de"]),
  colorTheme: z.enum(["system", "light", "dark"]),
  uiFont: z.enum(["inter", "helvetica", "serif", "system"]),
  editorFont: z.enum(["mono", "sans"]),
  fontSize: z.enum(["small", "medium", "large"]),
  defaultEditorView: z.enum(["write", "preview"]),
  fileViewDefaults: fileViewDefaultsSchema,
  ganttAppearance: ganttAppearanceSchema.default(DEFAULT_GANTT_APPEARANCE),
  defaultSpaceId: z.string().cuid().nullable(),
  compactMode: z.boolean(),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const preferencesUpdateSchema = preferencesSchema
  .omit({ fileViewDefaults: true })
  .extend({ fileViewDefaults: fileViewDefaultsSchema.optional() })
  .transform((value): Preferences => ({
    ...value,
    fileViewDefaults: value.fileViewDefaults ?? fileViewDefaultsForDefaultEditorView(value.defaultEditorView),
  }));

export const DEFAULT_PREFERENCES: Preferences = {
  language: "en",
  colorTheme: "system",
  uiFont: "inter",
  editorFont: "mono",
  fontSize: "medium",
  defaultEditorView: "write",
  fileViewDefaults: { ...DEFAULT_FILE_VIEW_DEFAULTS },
  ganttAppearance: copyGanttAppearance(DEFAULT_GANTT_APPEARANCE),
  defaultSpaceId: null,
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
