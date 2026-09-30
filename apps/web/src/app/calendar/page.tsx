import { requireUser } from "@/lib/access";
import { normalizePreferences } from "@/lib/preferences";
import { PreferencesProvider } from "@/components/preferences-provider";
import { CalendarPage } from "@/components/calendar-page";
import "./calendar.css";

export default async function Calendar() {
  const user = await requireUser();
  const preferences = normalizePreferences({
    language: user.language, colorTheme: user.colorTheme, uiFont: user.uiFont,
    editorFont: user.editorFont, fontSize: user.fontSize, defaultEditorView: user.defaultEditorView,
    fileViewDefaults: user.fileViewDefaults, ganttAppearance: user.ganttAppearance,
    defaultSpaceId: user.defaultSpaceId, compactMode: user.compactMode,
  });
  return <PreferencesProvider initial={preferences}><CalendarPage user={{ id: user.id, name: user.name || user.email }} /></PreferencesProvider>;
}
