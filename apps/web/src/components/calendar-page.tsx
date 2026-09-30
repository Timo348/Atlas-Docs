"use client";

import FullCalendar, { type CalendarRef, type EventDropInfo } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import listPlugin from "@fullcalendar/react/list";
import interactionPlugin from "@fullcalendar/react/interaction";
import monarchThemePlugin from "@fullcalendar/react/themes/monarch";
import germanLocale from "@fullcalendar/react/locales/de";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckSquare2, ChevronLeft, ChevronRight, CircleAlert, Clock3, Download, ExternalLink, Filter, Flag, LockKeyhole, Plus, RefreshCw, Repeat2, Settings2, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Temporal } from "temporal-polyfill";
import { usePreferences } from "@/components/preferences-provider";
import { useDialogEscape } from "@/components/use-dialog-escape";
import type { CalendarEntryInput, CalendarEvent, CalendarPreferences, CalendarQueryResult, CalendarRecurrence, CalendarView } from "@/lib/calendar";
import { addCalendarDays, browserTimeZone, calendarSourceColor, calendarToday, localCalendarTime } from "@/lib/calendar-display";
import { CalendarSaveError, saveCalendarSpaceTask } from "@/lib/calendar-collaboration";
import { TODO_COLUMNS, TODO_PRIORITIES, type TodoColumn, type TodoPriority, type TodoTaskUpdate } from "@/lib/todo-board";

type Translate = (english: string, german: string) => string;
type Draft = { event: CalendarEvent | null; date?: string; deadline?: string };
const VIEW_OPTIONS: { view: CalendarView; en: string; de: string }[] = [
  { view: "dayGridMonth", en: "Month", de: "Monat" }, { view: "timeGridWeek", en: "Week", de: "Woche" },
  { view: "timeGridDay", en: "Day", de: "Tag" }, { view: "listMonth", en: "Agenda", de: "Agenda" },
];

export function CalendarPage({ user }: { user: { id: string; name: string } }) {
  const { preferences: atlasPreferences, text } = usePreferences();
  const calendar = useRef<CalendarRef>(null);
  const [preferences, setPreferences] = useState<CalendarPreferences | null>(null);
  const preferencesQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [data, setData] = useState<CalendarQueryResult | null>(null);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [privateVisible, setPrivateVisible] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const requestNumber = useRef(0);
  const timeZone = preferences?.timeZone || browserTimeZone();
  const today = calendarToday(timeZone);

  useEffect(() => {
    let active = true;
    fetch("/api/calendar/preferences", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("preferences");
      const result = await response.json() as CalendarPreferences | { preferences: CalendarPreferences; saved?: boolean };
      const initial = "preferences" in result ? result.preferences : result;
      const saved = "preferences" in result ? result.saved !== false : true;
      if (!saved && window.matchMedia("(max-width: 760px)").matches) initial.view = "listMonth";
      if (!saved) initial.timeZone = browserTimeZone();
      if (active) {
        setPreferences(initial);
        if (!saved) void fetch("/api/calendar/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ view: initial.view, timeZone: initial.timeZone }) });
      }
    }).catch(() => { if (active) { setError(text("Calendar preferences could not be loaded.", "Kalenderpräferenzen konnten nicht geladen werden.")); setLoading(false); } });
    return () => { active = false; };
  }, [text]);

  const refresh = useCallback(async () => {
    if (!preferences || !range) return;
    const serial = ++requestNumber.current;
    const query = new URLSearchParams({ start: range.start, end: range.end, spaces: preferences.selectedSpaceIds.join(","), scope: preferences.taskScope, completed: String(preferences.showCompleted), today });
    try {
      const response = await fetch(`/api/calendar?${query}`, { cache: "no-store" });
      if (response.status === 403) {
        const accessResponse = await fetch("/api/calendar/preferences", { cache: "no-store" });
        if (accessResponse.ok && serial === requestNumber.current) {
          const latest = await accessResponse.json() as { preferences: CalendarPreferences };
          setData(null);
          setPreferences(latest.preferences);
          setNotice(text("Space access changed. Calendar sources have been updated.", "Space-Zugriff hat sich geändert. Die Kalenderquellen wurden aktualisiert."));
          return;
        }
      }
      if (!response.ok) throw new Error("calendar");
      const next = await response.json() as CalendarQueryResult;
      if (serial === requestNumber.current) {
        setData(next); setError("");
        setDraft((current) => {
          const item = current?.event;
          if (item?.source !== "space") return current;
          const role = next.spaces.find((space) => space.id === item.spaceId)?.role;
          const permitted = role === "OWNER" || role === "EDITOR";
          return permitted === item.canEdit ? current : { ...current, event: { ...item, canEdit: permitted } };
        });
        // Newly accessible sources are selected by the server preference merge.
        const currentKnown = new Set(preferences.knownSpaceIds);
        if (next.spaces.some((space) => !currentKnown.has(space.id))) {
          setPreferences((current) => current && ({ ...current, knownSpaceIds: next.preferences.knownSpaceIds, selectedSpaceIds: [...new Set([...current.selectedSpaceIds, ...next.spaces.filter((space) => !currentKnown.has(space.id)).map((space) => space.id)])] }));
        }
      }
    } catch { if (serial === requestNumber.current) setError(text("Calendar could not be refreshed. Try again.", "Kalender konnte nicht aktualisiert werden. Versuche es erneut.")); }
    finally { if (serial === requestNumber.current) setLoading(false); }
  }, [preferences, range, today, text]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => { clearInterval(interval); window.removeEventListener("focus", focus); };
  }, [refresh]);

  function updatePreferences(update: Partial<CalendarPreferences>) {
    if (!preferences) return;
    setPreferences({ ...preferences, ...update });
    const { knownSpaceIds: _known, ...allowed } = update;
    preferencesQueue.current = preferencesQueue.current.catch(() => undefined).then(async () => {
      const response = await fetch("/api/calendar/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(allowed) });
      if (!response.ok) setError(text("Your selection could not be saved.", "Deine Auswahl konnte nicht gespeichert werden."));
    });
  }

  function changeView(view: CalendarView) { calendar.current?.getApi().changeView(view); updatePreferences({ view }); }
  const events = useMemo(() => (data?.events || []).filter((event) => privateVisible || event.source !== "personal").map((event) => ({
    id: event.id, title: event.title, start: event.start || undefined, end: event.end || undefined, allDay: event.allDay,
    color: event.source === "personal" ? "#526fb5" : calendarSourceColor(event.spaceId!), contrastColor: "#ffffff",
    startEditable: event.source === "space" && event.canEdit, durationEditable: false,
    extendedProps: { atlasEvent: event },
    className: event.completed ? "atlas-calendar-completed" : "",
  })), [data, privateVisible]);

  async function dropTask(info: EventDropInfo) {
    const event = info.event.extendedProps.atlasEvent as CalendarEvent;
    const deadline = info.event.startStr.slice(0, 10);
    info.revert(); // Keep the indexed view until confirmed; editing stays reviewable.
    if (!event.task || !event.pageId || !event.canEdit) return;
    setNotice(text("Saving the board task…", "Board-Aufgabe wird gespeichert…"));
    try {
      await saveCalendarSpaceTask(event.pageId, event.task, { deadline });
      setNotice(text("Due date saved.", "Fälligkeit gespeichert.")); void refresh();
    } catch (failure) {
      setNotice(""); setDraft({ event, deadline });
      setError(saveFailureText(failure, text));
    }
  }

  return <main className="atlas-calendar-page">
    <aside className={`calendar-sidebar ${sourcesOpen ? "calendar-sidebar-open" : ""}`}>
      <Link href="/" className="calendar-back"><ArrowLeft size={17} />{text("Workspace", "Arbeitsbereich")}</Link>
      <div className="calendar-sidebar-title"><CalendarDays size={23} /><h1>{text("Calendar", "Kalender")}</h1><button className="icon-button calendar-mobile-only" aria-label={text("Close sources", "Quellen schließen")} onClick={() => setSourcesOpen(false)}><X size={18} /></button></div>
      <p className="calendar-private-note"><LockKeyhole size={15} />{text("Your appointments and personal todos are private.", "Deine Termine und persönlichen Todos sind privat.")}</p>
      <section className="calendar-source-section">
        <h2>{text("Sources", "Quellen")}</h2>
        <label className="calendar-source"><input type="checkbox" checked={privateVisible} onChange={(event) => setPrivateVisible(event.target.checked)} /><span className="calendar-source-color" style={{ background: "#526fb5" }} /><span>{text("Personal", "Persönlich")}</span><LockKeyhole size={13} /></label>
        <div className="calendar-source-actions"><button type="button" onClick={() => updatePreferences({ selectedSpaceIds: data?.spaces.map((space) => space.id) || [] })}>{text("Select all", "Alle auswählen")}</button><button type="button" onClick={() => updatePreferences({ selectedSpaceIds: [] })}>{text("Clear all", "Alle abwählen")}</button></div>
        {data?.spaces.map((space) => <label key={space.id} className="calendar-source"><input type="checkbox" checked={preferences?.selectedSpaceIds.includes(space.id) || false} onChange={(event) => updatePreferences({ selectedSpaceIds: event.target.checked ? [...(preferences?.selectedSpaceIds || []), space.id] : preferences!.selectedSpaceIds.filter((id) => id !== space.id) })} /><span className="calendar-source-color" style={{ background: calendarSourceColor(space.id) }} /><span>{space.name}<small>{space.role === "VIEWER" ? text("Read only", "Nur lesen") : text("Space tasks", "Space-Aufgaben")}</small></span></label>)}
        {data && !data.spaces.length && <p className="calendar-muted">{text("No space access yet. Your personal calendar is available.", "Noch kein Space-Zugriff. Dein persönlicher Kalender ist verfügbar.")}</p>}
      </section>
      <section className="calendar-source-section">
        <h2>{text("Space tasks", "Space-Aufgaben")}</h2>
        <div className="calendar-segmented"><button className={preferences?.taskScope === "all" ? "active" : ""} onClick={() => updatePreferences({ taskScope: "all" })}>{text("All", "Alle")}</button><button className={preferences?.taskScope === "mine" ? "active" : ""} onClick={() => updatePreferences({ taskScope: "mine" })}>{text("Mine", "Meine")}</button></div>
        <label className="calendar-check"><input type="checkbox" checked={preferences?.showCompleted || false} onChange={(event) => updatePreferences({ showCompleted: event.target.checked })} />{text("Show completed", "Erledigte anzeigen")}</label>
      </section>
      <div className="calendar-sidebar-footer"><span>{user.name}</span><a href="/api/calendar/export" download className="calendar-back"><Download size={16} />{text("Personal JSON export", "Persönlicher JSON-Export")}</a><Link href="/settings" className="calendar-back"><Settings2 size={16} />{text("Settings", "Einstellungen")}</Link></div>
    </aside>
    {sourcesOpen && <button className="calendar-sidebar-overlay" aria-label={text("Close sources", "Quellen schließen")} onClick={() => setSourcesOpen(false)} />}
    <section className="calendar-main">
      <header className="calendar-toolbar">
        <div className="calendar-toolbar-navigation"><button className="icon-button bordered calendar-mobile-only" onClick={() => setSourcesOpen(true)} aria-label={text("Show sources", "Quellen anzeigen")}><Filter size={18} /></button><button className="button compact secondary-button" onClick={() => calendar.current?.getApi().today()}>{text("Today", "Heute")}</button><button className="icon-button bordered" aria-label={text("Previous period", "Vorheriger Zeitraum")} onClick={() => calendar.current?.getApi().prev()}><ChevronLeft size={19} /></button><button className="icon-button bordered" aria-label={text("Next period", "Nächster Zeitraum")} onClick={() => calendar.current?.getApi().next()}><ChevronRight size={19} /></button><h2 aria-live="polite">{title || text("Calendar", "Kalender")}</h2></div>
        <div className="calendar-toolbar-actions"><select aria-label={text("Calendar view", "Kalenderansicht")} value={preferences?.view || "dayGridMonth"} onChange={(event) => changeView(event.target.value as CalendarView)}>{VIEW_OPTIONS.map((option) => <option key={option.view} value={option.view}>{text(option.en, option.de)}</option>)}</select><button className="button primary-button compact" onClick={() => { setError(""); setDraft({ event: null }); }} disabled={!preferences}><Plus size={17} />{text("New", "Neu")}</button></div>
      </header>
      {error && <div className="calendar-feedback calendar-error" role="alert"><CircleAlert size={17} /><span>{error}</span><button className="icon-button" aria-label={text("Refresh calendar", "Kalender aktualisieren")} onClick={() => void refresh()}><RefreshCw size={16} /></button></div>}
      {notice && <div className="calendar-feedback" role="status">{notice}</div>}
      {!!data?.indexWarnings.length && <div className="calendar-feedback calendar-warning" role="status"><CircleAlert size={17} /><span>{text("Some boards could not be indexed. Their original data is preserved:", "Einige Boards konnten nicht indexiert werden. Die Originaldaten bleiben erhalten:")} {data.indexWarnings.map((warning) => warning.title).join(", ")}</span></div>}
      <div className="calendar-surface">
        {preferences ? <FullCalendar className="fc atlas-fullcalendar" ref={calendar} plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, monarchThemePlugin]} initialView={preferences.view} headerToolbar={false} footerToolbar={false} locales={[germanLocale]} locale={atlasPreferences.language} timeZone={timeZone} firstDay={1} height="auto" nowIndicator editable eventDurationEditable={false} selectable={false} dayMaxEvents={3} events={events} datesSet={(info) => { setTitle(info.view.title); setRange((current) => current?.start === info.startStr.slice(0, 10) && current.end === info.endStr.slice(0, 10) ? current : { start: info.startStr.slice(0, 10), end: info.endStr.slice(0, 10) }); }} dateClick={(info) => setDraft({ event: null, date: info.dateStr.slice(0, 10) })} eventClick={(info) => { info.jsEvent.preventDefault(); setError(""); setDraft({ event: info.event.extendedProps.atlasEvent as CalendarEvent }); }} eventDrop={(info) => void dropTask(info)} eventContent={(info) => { const item = info.event.extendedProps.atlasEvent as CalendarEvent; return <span className="calendar-event-content">{item.kind === "todo" ? <CheckSquare2 size={13} /> : <CalendarDays size={13} />}<span>{info.timeText && <small>{info.timeText} </small>}{item.title}</span>{item.kind === "todo" && <span className="calendar-event-status">{item.completed ? text("Done", "Erledigt") : item.task ? columnText(item.task.column, text) : text("Open", "Offen")}</span>}{item.recurrence && <Repeat2 size={12} />}</span>; }} noEventsContent={text("No entries in this period.", "Keine Einträge in diesem Zeitraum.")} allDayText={text("All day", "Ganztägig")} /> : <div className="calendar-loading"><CalendarDays size={25} />{loading ? text("Loading calendar…", "Kalender wird geladen…") : text("Calendar unavailable", "Kalender nicht verfügbar")}</div>}
      </div>
      <div className="calendar-task-overviews"><CalendarTaskList title={text("Overdue", "Überfällig")} icon="overdue" events={(data?.overdue || []).filter((event) => privateVisible || event.source !== "personal")} text={text} onOpen={(event) => setDraft({ event })} truncated={data?.overdueTruncated} /><CalendarTaskList title={text("No due date", "Ohne Termin")} icon="undated" events={(data?.undated || []).filter((event) => privateVisible || event.source !== "personal")} text={text} onOpen={(event) => setDraft({ event })} truncated={data?.undatedTruncated} /></div>
    </section>
    {draft && <CalendarEntryDialog key={draft.event?.id || `new-${draft.date || today}`} draft={draft} timeZone={timeZone} text={text} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); setNotice(text("Saved.", "Gespeichert.")); void refresh(); }} />}
  </main>;
}

function CalendarTaskList({ title, icon, events, text, onOpen, truncated }: { title: string; icon: "overdue" | "undated"; events: CalendarEvent[]; text: Translate; onOpen: (event: CalendarEvent) => void; truncated?: boolean }) {
  return <section className={`calendar-task-list calendar-task-list-${icon}`}><h3>{icon === "overdue" ? <CircleAlert size={17} /> : <Clock3 size={17} />}{title}<span>{events.length}</span></h3>{events.length ? <ul>{events.map((event) => <li key={event.id}><button onClick={() => onOpen(event)}><CheckSquare2 size={15} /><span><strong>{event.title}</strong><small>{event.source === "personal" ? text("Personal", "Persönlich") : text("Space task", "Space-Aufgabe")}{event.start ? ` · ${event.start.slice(0, 10)}` : ""}</small></span>{event.priority === "URGENT" || event.priority === "HIGH" ? <Flag size={14} /> : null}</button></li>)}</ul> : <p>{text("No tasks", "Keine Aufgaben")}</p>}{truncated && <p>{text("The overview is limited. Older recurring todos or additional tasks may be omitted.", "Die Übersicht ist begrenzt. Ältere wiederkehrende Todos oder weitere Aufgaben können fehlen.")}</p>}</section>;
}

function CalendarEntryDialog({ draft, timeZone, text, onClose, onSaved }: { draft: Draft; timeZone: string; text: Translate; onClose: () => void; onSaved: () => void }) {
  const event = draft.event;
  const personal = !event || event.source === "personal";
  const [kind, setKind] = useState<"appointment" | "todo">(event?.kind || "appointment");
  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [location, setLocation] = useState(event?.location || "");
  const [allDay, setAllDay] = useState(event?.allDay || false);
  const [zone, setZone] = useState(event?.timeZone || timeZone);
  const firstDate = draft.date || calendarToday(timeZone);
  const [start, setStart] = useState(event?.kind === "appointment" ? event.entry?.start || (event.allDay ? event.start?.slice(0, 10) : localCalendarTime(event.start, event.timeZone || timeZone)) || "" : `${firstDate}T09:00`);
  const [end, setEnd] = useState(event?.kind === "appointment" ? (event.allDay ? addCalendarDays((event.entry?.end || event.end!).slice(0, 10), -1) : event.entry?.end || localCalendarTime(event.end, event.timeZone || timeZone)) || "" : `${firstDate}T10:00`);
  const [dueDate, setDueDate] = useState(draft.deadline ?? event?.task?.deadline ?? event?.entry?.dueDate ?? (event?.kind === "todo" ? event.start?.slice(0, 10) : draft.date) ?? "");
  const [completed, setCompleted] = useState(event?.completed || false);
  const [column, setColumn] = useState<TodoColumn>(event?.task?.column || "NEW");
  const [priority, setPriority] = useState<TodoPriority>(event?.priority || "MEDIUM");
  const [assigneeIds, setAssigneeIds] = useState(event?.assigneeIds || []);
  const [members, setMembers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [recurrence, setRecurrence] = useState<CalendarRecurrence | null>(event?.recurrence || null);
  const [scope, setScope] = useState<"occurrence" | "following">("occurrence");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(draft.deadline ? text("The change was not confirmed. Your draft is preserved; review and retry.", "Die Änderung wurde nicht bestätigt. Dein Entwurf bleibt erhalten; prüfe ihn und versuche es erneut.") : "");
  const [deleting, setDeleting] = useState(false);
  const [canEdit, setCanEdit] = useState(event?.canEdit ?? true);
  useDialogEscape(onClose, busy, true);
  useEffect(() => {
    if (!event?.spaceId) return;
    let active = true;
    fetch(`/api/calendar/spaces/${encodeURIComponent(event.spaceId)}/members`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) { if (active) setCanEdit(false); return; }
      const result = await response.json() as { members: typeof members; canEdit: boolean };
      if (active) { setMembers(result.members); setCanEdit(result.canEdit && event.canEdit); }
    }).catch(() => active && setError(text("Space access could not be checked.", "Space-Zugriff konnte nicht geprüft werden.")));
    return () => { active = false; };
  }, [event, text]);

  function toggleAllDay(checked: boolean) {
    setAllDay(checked);
    if (checked) { setStart(start.slice(0, 10)); setEnd(end.slice(0, 10)); }
    else { setStart(`${start.slice(0, 10)}T09:00`); setEnd(`${end.slice(0, 10)}T10:00`); }
  }

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!canEdit || busy) return;
    setBusy(true); setError("");
    try {
      if (!personal && event?.task && event.pageId) {
        const update: TodoTaskUpdate = { title: title.trim(), description, column, priority, deadline: dueDate || null, assigneeIds };
        await saveCalendarSpaceTask(event.pageId, event.task, update);
      } else {
        // Local wall times + stored IANA zone retain their time through daylight-saving changes.
        if (kind === "appointment" && !allDay) {
          // Existing recurring wall times may resolve compatibly in a DST gap.
          // Preserve their original local values when only text is changed.
          const preserveStart = event?.entry?.start === start && event.timeZone === zone;
          const preserveEnd = event?.entry?.end === end && event.timeZone === zone;
          Temporal.PlainDateTime.from(start).toZonedDateTime(zone, { disambiguation: preserveStart ? "compatible" : "reject" });
          Temporal.PlainDateTime.from(end).toZonedDateTime(zone, { disambiguation: preserveEnd ? "compatible" : "reject" });
        }
        const input: CalendarEntryInput = { kind, title: title.trim(), description, location: kind === "appointment" ? location || null : null, allDay: kind === "todo" || allDay, start: kind === "appointment" ? start : null, end: kind === "appointment" ? (allDay ? addCalendarDays(end, 1) : end) : null, dueDate: kind === "todo" ? dueDate || null : null, timeZone: zone, completed, priority, recurrence };
        const response = await fetch(event?.entryId ? `/api/calendar/entries/${encodeURIComponent(event.entryId)}` : "/api/calendar/entries", { method: event ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event ? { ...input, scope, occurrenceKey: event.occurrenceKey, revision: event.revision } : input) });
        if (!response.ok) throw new CalendarSaveError(response.status === 409 ? "conflict" : response.status === 403 || response.status === 404 ? "permission" : "dependency");
      }
      onSaved();
    } catch (failure) { setError(saveFailureText(failure, text)); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!personal || !event?.entryId || busy || !canEdit) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/calendar/entries/${encodeURIComponent(event.entryId)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, occurrenceKey: event.occurrenceKey, revision: event.revision }) });
      if (!response.ok) throw new CalendarSaveError(response.status === 409 ? "conflict" : "permission");
      onSaved();
    } catch (failure) { setError(saveFailureText(failure, text)); setBusy(false); }
  }

  return <div className="modal-backdrop calendar-dialog-backdrop" onMouseDown={(pointer) => pointer.target === pointer.currentTarget && !busy && onClose()}><form className="calendar-dialog" onSubmit={(formEvent) => void submit(formEvent)} role="dialog" aria-modal="true" aria-label={event ? text("Entry details", "Eintragsdetails") : text("New entry", "Neuer Eintrag")}>
    <header><div><span className="calendar-dialog-kicker">{personal ? text("Private calendar", "Privater Kalender") : text("Space task", "Space-Aufgabe")}</span><h2>{event ? text("Entry details", "Eintragsdetails") : text("New entry", "Neuer Eintrag")}</h2></div><button className="icon-button" type="button" disabled={busy} onClick={onClose} aria-label={text("Close", "Schließen")}><X size={19} /></button></header>
    <div className="calendar-dialog-body">
      {!canEdit && <p className="calendar-feedback"><LockKeyhole size={15} />{text("Read only. Current space access does not allow changes.", "Nur lesen. Der aktuelle Space-Zugriff erlaubt keine Änderungen.")}</p>}
      {error && <p className="calendar-feedback calendar-error" role="alert"><CircleAlert size={16} />{error}</p>}
      {!event && <div className="calendar-segmented"><button type="button" className={kind === "appointment" ? "active" : ""} onClick={() => setKind("appointment")}><CalendarDays size={15} />{text("Appointment", "Termin")}</button><button type="button" className={kind === "todo" ? "active" : ""} onClick={() => setKind("todo")}><CheckSquare2 size={15} />Todo</button></div>}
      <fieldset disabled={!canEdit || busy} className="calendar-dialog-fields">
        <label><span>{text("Title", "Titel")}</span><input autoFocus required maxLength={240} value={title} onChange={(input) => setTitle(input.target.value)} /></label>
        <label><span>{text("Description", "Beschreibung")}</span><textarea maxLength={12000} value={description} onChange={(input) => setDescription(input.target.value)} rows={4} /></label>
        {kind === "appointment" ? <><label><span>{text("Location", "Ort")}</span><input maxLength={500} value={location} onChange={(input) => setLocation(input.target.value)} /></label><label className="calendar-check"><input type="checkbox" disabled={Boolean(event?.recurrence)} checked={allDay} onChange={(input) => toggleAllDay(input.target.checked)} />{text("All day", "Ganztägig")}</label><div className="calendar-form-grid"><label><span>{text("Start", "Beginn")}</span><input required step={allDay ? undefined : 1} type={allDay ? "date" : "datetime-local"} value={start} onChange={(input) => setStart(input.target.value)} /></label><label><span>{allDay ? text("Last day", "Letzter Tag") : text("End", "Ende")}</span><input required step={allDay ? undefined : 1} type={allDay ? "date" : "datetime-local"} value={end} min={start} onChange={(input) => setEnd(input.target.value)} /></label></div><label><span>{text("Time zone", "Zeitzone")}</span><input value={zone} onChange={(input) => setZone(input.target.value)} list="calendar-time-zones" /><datalist id="calendar-time-zones"><option value={timeZone} /><option value="Europe/Berlin" /><option value="UTC" /><option value="America/New_York" /><option value="Asia/Tokyo" /></datalist></label></> : <><div className="calendar-form-grid"><label><span>{text("Due date (optional)", "Fälligkeit (optional)")}</span><input type="date" required={personal && Boolean(recurrence)} value={dueDate} onChange={(input) => setDueDate(input.target.value)} /></label><label><span>{text("Priority", "Priorität")}</span><select value={priority} onChange={(input) => setPriority(input.target.value as TodoPriority)}>{TODO_PRIORITIES.map((value) => <option key={value} value={value}>{priorityText(value, text)}</option>)}</select></label></div>{personal ? <label className="calendar-check"><input type="checkbox" checked={completed} onChange={(input) => setCompleted(input.target.checked)} />{text("Completed", "Erledigt")}</label> : <label><span>{text("Status", "Status")}</span><select value={column} onChange={(input) => setColumn(input.target.value as TodoColumn)}>{TODO_COLUMNS.map((value) => <option key={value} value={value}>{columnText(value, text)}</option>)}</select></label>}</>}
        {!personal && <fieldset className="calendar-assignees"><legend>{text("Assigned to", "Zuständig")}</legend>{members.map((member) => <label className="calendar-check" key={member.id}><input type="checkbox" checked={assigneeIds.includes(member.id)} onChange={(input) => setAssigneeIds(input.target.checked ? [...assigneeIds, member.id] : assigneeIds.filter((id) => id !== member.id))} /><span>{member.name || member.email}</span></label>)}{!members.length && <p>{text("No assignable members.", "Keine zuweisbaren Mitglieder.")}</p>}<button className="button compact secondary-button" type="button" onClick={() => setAssigneeIds([])}>{text("Unassign all", "Zuweisungen entfernen")}</button></fieldset>}
        {personal && <fieldset className="calendar-recurrence" disabled={Boolean(event?.recurrence && scope === "occurrence")}><legend><Repeat2 size={15} />{text("Repeat", "Wiederholen")}</legend><select aria-label={text("Repeat frequency", "Wiederholung")} value={recurrence?.frequency || "none"} onChange={(input) => setRecurrence(input.target.value === "none" ? null : { frequency: input.target.value as CalendarRecurrence["frequency"], interval: 1 })}><option value="none">{text("Does not repeat", "Keine Wiederholung")}</option>{([['daily', 'Daily', 'Täglich'], ['weekly', 'Weekly', 'Wöchentlich'], ['monthly', 'Monthly', 'Monatlich'], ['yearly', 'Yearly', 'Jährlich']] as const).map(([value, en, de]) => <option key={value} value={value}>{text(en, de)}</option>)}</select>{recurrence && <><div className="calendar-form-grid"><label><span>{text("Interval", "Intervall")}</span><input type="number" min={1} max={100} value={recurrence.interval} onChange={(input) => setRecurrence({ ...recurrence, interval: Number(input.target.value) })} /></label><label><span>{text("End date (optional)", "Enddatum (optional)")}</span><input type="date" value={recurrence.until || ""} onChange={(input) => setRecurrence({ frequency: recurrence.frequency, interval: recurrence.interval, ...(input.target.value ? { until: input.target.value } : {}) })} /></label><label><span>{text("Occurrences (optional)", "Anzahl (optional)")}</span><input type="number" min={1} max={10000} value={recurrence.count || ""} onChange={(input) => setRecurrence({ frequency: recurrence.frequency, interval: recurrence.interval, ...(input.target.value ? { count: Number(input.target.value) } : {}) })} /></label></div><p className="calendar-muted">{text("Choose either an end date or a number of occurrences.", "Wähle entweder ein Enddatum oder eine Anzahl von Vorkommen.")}</p></>}</fieldset>}
      </fieldset>
      {event?.recurrence && personal && <label className="calendar-series-scope"><span>{text("Apply change to", "Änderung anwenden auf")}</span><select disabled={busy || !canEdit} value={scope} onChange={(input) => setScope(input.target.value as "occurrence" | "following")}><option value="occurrence">{text("This occurrence", "Dieses Vorkommen")}</option><option value="following">{text("This and all following", "Dieses und alle folgenden")}</option></select></label>}
      {event?.boardUrl && <Link className="calendar-board-link" href={event.boardUrl}><ExternalLink size={16} />{text("Open in board", "Im Board öffnen")}</Link>}
      {deleting && <div className="calendar-delete-confirm"><p>{event?.recurrence && scope === "following" ? text("Delete this and all following occurrences? Earlier occurrences are kept.", "Dieses und alle folgenden Vorkommen löschen? Frühere Vorkommen bleiben erhalten.") : text("Delete this entry?", "Diesen Eintrag löschen?")}</p><button className="button compact danger-button" type="button" disabled={busy} onClick={() => void remove()}>{text("Confirm deletion", "Löschen bestätigen")}</button><button className="button compact secondary-button" type="button" onClick={() => setDeleting(false)}>{text("Cancel", "Abbrechen")}</button></div>}
    </div>
    <footer>{personal && event && canEdit ? <button className="button compact secondary-button" type="button" disabled={busy} onClick={() => setDeleting(true)}>{text("Delete", "Löschen")}</button> : <span />}<div><button className="button compact secondary-button" type="button" disabled={busy} onClick={onClose}>{text("Close", "Schließen")}</button>{canEdit && <button className="button compact primary-button" type="submit" disabled={busy}>{busy ? text("Waiting for confirmation…", "Warte auf Bestätigung…") : text("Save", "Speichern")}</button>}</div></footer>
  </form></div>;
}

function priorityText(priority: TodoPriority, text: Translate) { return ({ URGENT: text("Urgent", "Dringend"), HIGH: text("High", "Hoch"), MEDIUM: text("Medium", "Mittel"), LOW: text("Low", "Niedrig") })[priority]; }
function columnText(column: TodoColumn, text: Translate) { return ({ NEW: text("New", "Neu"), SCHEDULED: text("Scheduled", "Geplant"), IN_PROGRESS: text("In progress", "In Arbeit"), COMPLETED: text("Completed", "Erledigt") })[column]; }
function saveFailureText(failure: unknown, text: Translate) {
  if (failure instanceof CalendarSaveError) {
    if (failure.reason === "conflict") return text("This entry changed elsewhere. Your draft is preserved. Close and reopen to review the current version.", "Dieser Eintrag wurde gleichzeitig geändert. Dein Entwurf bleibt erhalten. Schließe und öffne ihn erneut, um den aktuellen Stand zu prüfen.");
    if (failure.reason === "permission") return text("Your current access does not allow saving. Your draft is preserved.", "Dein aktueller Zugriff erlaubt kein Speichern. Dein Entwurf bleibt erhalten.");
    if (failure.reason === "timeout") return text("Saving was not confirmed within 30 seconds. Your draft is preserved. Check the board before retrying.", "Speichern wurde innerhalb von 30 Sekunden nicht bestätigt. Dein Entwurf bleibt erhalten. Prüfe vor einem erneuten Versuch das Board.");
    if (failure.reason === "missing") return text("The task no longer exists. Your draft is preserved.", "Die Aufgabe existiert nicht mehr. Dein Entwurf bleibt erhalten.");
    return text("Check dates and complete prerequisite tasks first. Your draft is preserved.", "Prüfe die Datumsangaben und erledige zuerst abhängige Aufgaben. Dein Entwurf bleibt erhalten.");
  }
  return text("Saving failed. Check the dates and time zone. Your draft is preserved.", "Speichern fehlgeschlagen. Prüfe Datumsangaben und Zeitzone. Dein Entwurf bleibt erhalten.");
}
