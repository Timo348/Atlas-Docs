"use client";

import { CalendarDays, CirclePlus, EyeOff, FileUp, Trash2, X } from "lucide-react";
import { type ChangeEvent, type CSSProperties, type PointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import { useDialogEscape } from "@/components/use-dialog-escape";
import { usePreferences } from "@/components/preferences-provider";
import type { GanttAppearance } from "@/lib/preferences";
import {
  addDays,
  addGanttSection,
  addGanttTask,
  createEmptyGanttDocument,
  daysBetween,
  deleteGanttTask,
  ganttDurationFromDates,
  parseGanttSource,
  scheduledGanttTasks,
  serializeGanttDocument,
  updateGanttTask,
  type GanttDocument,
  type GanttTask,
  type GanttTaskSchedule,
  type GanttTaskStatus,
} from "@/lib/gantt-editor";

type Text = (english: string, german: string) => string;
type EditingState = { mode: "new"; start: string } | { mode: "edit"; taskId: string };
type DragState = {
  taskId: string;
  kind: "move" | "resize";
  pointerId: number;
  originX: number;
  start: string;
  duration: number;
  deltaDays: number;
};
type CalendarRange = { start: string; days: number };
type TaskDraft = {
  title: string;
  sectionTitle: string;
  start: string;
  end: string;
  progress: number;
  status: GanttTaskStatus;
  after: string | null;
};
type CalendarSection = {
  id: string;
  title: string;
  tracks: Array<Array<{ task: GanttTask; schedule: GanttTaskSchedule }>>;
  taskCount: number;
};

const DAY_WIDTH = 44;
const MAX_IMPORT_BYTES = 1_000_000;

export function CollaborativeGantt({
  source,
  readOnly,
  onChange,
}: {
  source: string;
  readOnly: boolean;
  onChange: (value: string, cursor: number, anchor: number) => void;
}) {
  const { preferences, text } = usePreferences();
  const parsed = parseGanttSource(source);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [importNotice, setImportNotice] = useState("");
  const [pastDatesDimmed, setPastDatesDimmed] = useState(preferences.ganttAppearance.dimPastDates);
  const importInputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPastDatesDimmed(preferences.ganttAppearance.dimPastDates);
  }, [preferences.ganttAppearance.dimPastDates]);

  function publish(next: GanttDocument) {
    if (readOnly) return;
    const value = serializeGanttDocument(next);
    onChange(value, value.length, value.length);
  }

  async function importMermaid(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || readOnly) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setImportNotice(text("The selected Mermaid Gantt file is larger than 1 MB.", "Die ausgewählte Mermaid-Gantt-Datei ist größer als 1 MB."));
      return;
    }
    try {
      const imported = parseGanttSource(await file.text());
      if (!imported.supported) {
        setImportNotice(text(
          `The import was not changed: ${imported.reason}`,
          `Der Import wurde nicht übernommen: ${imported.reason}`,
        ));
        return;
      }
      publish(imported.document);
      setImportNotice(text("Mermaid Gantt plan imported.", "Mermaid-Gantt-Plan importiert."));
    } catch {
      setImportNotice(text("The Mermaid Gantt file could not be read.", "Die Mermaid-Gantt-Datei konnte nicht gelesen werden."));
    }
  }

  if (!parsed.supported && source.trim()) {
    return <GanttImportRecovery
      reason={parsed.reason}
      readOnly={readOnly}
      notice={importNotice}
      inputRef={importInputRef}
      text={text}
      onImport={importMermaid}
    />;
  }

  const plan = parsed.supported ? parsed.document : createEmptyGanttDocument(preferences.language);
  const schedules = scheduledGanttTasks(plan);
  const scheduleById = new Map(schedules.map((task) => [task.id, task]));
  const range = calendarRange(schedules);
  const sections = calendarSections(plan, scheduleById);
  const today = todayIso();
  const pastDays = Math.min(range.days, Math.max(0, daysBetween(range.start, today)));
  const calendarStyle = {
    "--gantt-days": range.days,
    "--gantt-day-width": `${DAY_WIDTH}px`,
    "--gantt-past-width": `${pastDays * DAY_WIDTH}px`,
  } as CSSProperties;
  const activeTask = editing?.mode === "edit"
    ? plan.sections.flatMap((section) => section.tasks).find((task) => task.id === editing.taskId) ?? null
    : null;

  function openNewTask(start = todayIso()) {
    if (!readOnly) setEditing({ mode: "new", start });
  }

  function saveTask(draft: TaskDraft) {
    if (readOnly || !editing) return;
    let next = plan;
    const section = resolveSection(next, draft.sectionTitle);
    if (!section) {
      next = addGanttSection(next, draft.sectionTitle);
    }
    const targetSection = resolveSection(next, draft.sectionTitle) ?? next.sections[0]!;
    if (editing.mode === "edit") {
      const patch: Parameters<typeof updateGanttTask>[2] = {
        title: draft.title,
        sectionId: targetSection.id,
        progress: draft.progress,
        status: draft.status,
        after: draft.after,
      };
      if (!draft.after) patch.start = draft.start;
      next = updateGanttTask(next, editing.taskId, patch);
      const scheduled = scheduledGanttTasks(next).find((task) => task.id === editing.taskId);
      next = updateGanttTask(next, editing.taskId, {
        duration: ganttDurationFromDates(scheduled?.start ?? draft.start, draft.end),
      });
    } else {
      next = addGanttTask(next, {
        title: draft.title,
        sectionId: targetSection.id,
        start: draft.after ? undefined : draft.start,
        progress: draft.progress,
        status: draft.status,
        after: draft.after,
      });
      const added = next.sections.find((item) => item.id === targetSection.id)?.tasks.at(-1);
      if (added) {
        const scheduled = scheduledGanttTasks(next).find((task) => task.id === added.id);
        next = updateGanttTask(next, added.id, {
          duration: ganttDurationFromDates(scheduled?.start ?? draft.start, draft.end),
        });
      }
    }
    publish(next);
    setEditing(null);
  }

  function deleteTask(taskId: string) {
    if (readOnly) return;
    publish(deleteGanttTask(plan, taskId));
    setEditing(null);
  }

  function startDrag(event: PointerEvent<HTMLElement>, task: GanttTask, schedule: GanttTaskSchedule, kind: DragState["kind"]) {
    if (readOnly || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      taskId: task.id,
      kind,
      pointerId: event.pointerId,
      originX: event.clientX,
      start: schedule.start,
      duration: task.duration,
      deltaDays: 0,
    });
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const deltaDays = Math.round((event.clientX - drag.originX) / DAY_WIDTH);
    if (deltaDays !== drag.deltaDays) setDrag({ ...drag, deltaDays });
  }

  function finishDrag(event: PointerEvent<HTMLElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const completed = drag;
    setDrag(null);
    if (!completed.deltaDays || readOnly) return;
    if (completed.kind === "move") {
      publish(updateGanttTask(plan, completed.taskId, { start: addDays(completed.start, completed.deltaDays) }));
    } else {
      publish(updateGanttTask(plan, completed.taskId, { duration: Math.max(1, completed.duration + completed.deltaDays) }));
    }
  }

  function scrollToToday() {
    const element = calendarRef.current;
    if (!element) return;
    const offset = daysBetween(range.start, todayIso());
    element.scrollTo({ left: Math.max(0, offset * DAY_WIDTH - element.clientWidth / 2), behavior: "smooth" });
  }

  return <section className="gantt-calendar" aria-label={text("Gantt planner", "Gantt-Planer")}>
    <header className="gantt-calendar-toolbar">
      <div>
        <span className="gantt-calendar-kicker">Atlas</span>
        <h2>{plan.title}</h2>
        <p>{readOnly
          ? text("This plan is shared read-only.", "Dieser Plan ist schreibgeschützt freigegeben.")
          : text("Drag task bars, resize their end, or double-click an item to edit it.", "Verschiebe Aufgabenbalken, ziehe ihr Ende oder bearbeite sie per Doppelklick.")}</p>
      </div>
      <div className="gantt-calendar-actions">
        <button type="button" className="button compact secondary-button" onClick={scrollToToday}><CalendarDays size={15} />{text("Today", "Heute")}</button>
        <button
          type="button"
          className="button compact secondary-button"
          aria-pressed={pastDatesDimmed}
          onClick={() => setPastDatesDimmed((current) => !current)}
        ><EyeOff size={15} />{text("Dim past dates", "Vergangenes ausgrauen")}</button>
        {!readOnly && <>
          <input ref={importInputRef} className="visually-hidden" type="file" accept=".gantt,.mmd,text/plain" onChange={(event) => void importMermaid(event)} />
          <button type="button" className="button compact secondary-button" onClick={() => importInputRef.current?.click()}><FileUp size={15} />{text("Import Mermaid Gantt", "Mermaid-Gantt importieren")}</button>
          <button type="button" className="button compact primary-button" onClick={() => openNewTask()}><CirclePlus size={16} />{text("New task", "Neue Aufgabe")}</button>
        </>}
      </div>
    </header>
    <div className="gantt-calendar-content">
      {importNotice && <p className="gantt-import-notice" role="status">{importNotice}</p>}
      <div className="gantt-calendar-scroll" ref={calendarRef}>
        <div className={`gantt-calendar-grid ${sections.length === 1 ? "gantt-calendar-grid-single-section" : ""} ${pastDatesDimmed ? "past-dates-dimmed" : ""}`} style={calendarStyle}>
          <CalendarHeader range={range} language={preferences.language} text={text} today={today} />
          {sections.map((section) => <CalendarSection
            key={section.id}
            section={section}
            range={range}
            drag={drag}
            readOnly={readOnly}
            text={text}
            today={today}
            appearance={preferences.ganttAppearance}
            onEdit={(taskId) => setEditing({ mode: "edit", taskId })}
            onNewAt={openNewTask}
            onDragStart={startDrag}
            onDragMove={moveDrag}
            onDragEnd={finishDrag}
          />)}
        </div>
      </div>
    </div>
    {editing && (editing.mode === "new" || activeTask) && <GanttTaskDialog
      key={editing.mode === "edit" ? editing.taskId : `new:${editing.start}`}
      plan={plan}
      task={activeTask}
      schedule={activeTask ? scheduleById.get(activeTask.id) ?? null : null}
      initialStart={editing.mode === "new" ? editing.start : null}
      text={text}
      appearance={preferences.ganttAppearance}
      onClose={() => setEditing(null)}
      onSave={saveTask}
      onDelete={activeTask ? () => deleteTask(activeTask.id) : undefined}
    />}
  </section>;
}

function CalendarHeader({ range, language, text, today }: { range: CalendarRange; language: "en" | "de"; text: Text; today: string }) {
  const locale = language === "de" ? "de-DE" : "en-US";
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const day = new Intl.DateTimeFormat(locale, { day: "2-digit" });
  const month = new Intl.DateTimeFormat(locale, { month: "short" });
  return <header className="gantt-calendar-header" aria-label={text("Calendar timeline", "Kalender-Zeitachse")}>
    {Array.from({ length: range.days }, (_, index) => {
      const value = addDays(range.start, index);
      const date = new Date(`${value}T12:00:00`);
      const monthStart = index === 0 || date.getDate() === 1;
      const classes = [monthStart ? "month-start" : "", value < today ? "past-date" : ""].filter(Boolean).join(" ");
      return <div className={classes} key={value} style={{ gridColumn: index + 1 }}>
        <small>{monthStart ? month.format(date) : weekday.format(date)}</small><strong>{day.format(date)}</strong>
      </div>;
    })}
  </header>;
}

function CalendarSection({
  section,
  range,
  drag,
  readOnly,
  text,
  today,
  appearance,
  onEdit,
  onNewAt,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  section: CalendarSection;
  range: CalendarRange;
  drag: DragState | null;
  readOnly: boolean;
  text: Text;
  today: string;
  appearance: GanttAppearance;
  onEdit: (taskId: string) => void;
  onNewAt: (start: string) => void;
  onDragStart: (event: PointerEvent<HTMLElement>, task: GanttTask, schedule: GanttTaskSchedule, kind: DragState["kind"]) => void;
  onDragMove: (event: PointerEvent<HTMLElement>) => void;
  onDragEnd: (event: PointerEvent<HTMLElement>) => void;
}) {
  const laneStyle = { "--gantt-tracks": Math.max(1, section.tracks.length) } as CSSProperties;
  return <section className="gantt-calendar-section">
    <header><span>{section.title}</span><small>{section.taskCount}</small></header>
    <div
      className="gantt-calendar-lane"
      style={laneStyle}
      onDoubleClick={(event) => {
        if (readOnly || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const day = Math.max(0, Math.min(range.days - 1, Math.floor((event.clientX - bounds.left) / DAY_WIDTH)));
        onNewAt(addDays(range.start, day));
      }}
      aria-label={text(`${section.title} calendar lane`, `${section.title}-Kalenderzeile`)}
    >
      {section.tracks.flatMap((track, trackIndex) => track.map(({ task, schedule }) => {
        const preview = drag?.taskId === task.id ? drag : null;
        const start = preview?.kind === "move" ? addDays(preview.start, preview.deltaDays) : schedule.start;
        const duration = preview?.kind === "resize" ? Math.max(1, task.duration + preview.deltaDays) : task.duration;
        const end = addDays(start, duration - 1);
        const startColumn = Math.max(1, daysBetween(range.start, start) + 1);
        const style = {
          gridColumn: `${startColumn} / span ${duration}`,
          gridRow: trackIndex + 1,
          "--gantt-event-color": appearance.statuses[task.status].color,
        } as CSSProperties;
        return <button
          className={`gantt-calendar-event gantt-task-${task.status} ${preview ? "dragging" : ""} ${end < today ? "past-event" : ""}`}
          key={task.id}
          type="button"
          style={style}
          title={text(`${task.title} · double-click to edit`, `${task.title} · Doppelklick zum Bearbeiten`)}
          aria-label={text(`${task.title}, starts ${start}, ends ${end}, ${task.progress}% complete`, `${task.title}, Start ${start}, Ende ${end}, ${task.progress}% fertig`)}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (!readOnly) onEdit(task.id);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (!readOnly) onEdit(task.id);
            }
          }}
          onPointerDown={(event) => onDragStart(event, task, schedule, "move")}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <i style={{ width: `${task.progress}%` }} />
          <span>{task.title}</span>
          {!readOnly && <b
            className="gantt-calendar-resize"
            role="presentation"
            onPointerDown={(event) => onDragStart(event, task, schedule, "resize")}
          />}
        </button>;
      }))}
      {!section.taskCount && <p>{text("Double-click here to schedule a task", "Doppelklicke hier, um eine Aufgabe zu planen")}</p>}
    </div>
  </section>;
}

function GanttTaskDialog({
  plan,
  task,
  schedule,
  initialStart,
  text,
  appearance,
  onClose,
  onSave,
  onDelete,
}: {
  plan: GanttDocument;
  task: GanttTask | null;
  schedule: GanttTaskSchedule | null;
  initialStart: string | null;
  text: Text;
  appearance: GanttAppearance;
  onClose: () => void;
  onSave: (draft: TaskDraft) => void;
  onDelete?: () => void;
}) {
  const existing = Boolean(task);
  const [title, setTitle] = useState(task?.title ?? "");
  const [sectionTitle, setSectionTitle] = useState(sectionTitleForTask(plan, task) ?? plan.sections[0]?.title ?? "Planning");
  const initialTaskStart = schedule?.start ?? initialStart ?? todayIso();
  const [start, setStart] = useState(initialTaskStart);
  const [end, setEnd] = useState(schedule?.end ?? addDays(initialTaskStart, (task?.duration ?? 3) - 1));
  const [status, setStatus] = useState<GanttTaskStatus>(task?.status ?? "none");
  const [progress, setProgress] = useState(task?.progress ?? 0);
  const [after, setAfter] = useState(task?.after ?? "");
  const tasks = plan.sections.flatMap((section) => section.tasks).filter((candidate) => candidate.id !== task?.id);
  const scheduleById = new Map(scheduledGanttTasks(plan).map((candidate) => [candidate.id, candidate]));
  useDialogEscape(onClose);

  function save() {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      sectionTitle: sectionTitle.trim() || "Planning",
      start,
      end,
      status,
      progress,
      after: after || null,
    });
  }

  return <div className="modal-backdrop gantt-task-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="gantt-task-dialog" role="dialog" aria-modal="true" aria-label={existing ? text("Edit task", "Aufgabe bearbeiten") : text("New task", "Neue Aufgabe")}>
      <header>
        <div><span>Atlas</span><h2>{existing ? text("Edit task", "Aufgabe bearbeiten") : text("New task", "Neue Aufgabe")}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={text("Close", "Schließen")}><X size={18} /></button>
      </header>
      <div className="gantt-task-dialog-body">
        <label className="gantt-dialog-title"><span>{text("Task name", "Aufgabenname")}</span><input autoFocus value={title} maxLength={240} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && save()} /></label>
        <div className="gantt-dialog-grid">
          <label><span>{text("Section", "Abschnitt")}</span><input value={sectionTitle} maxLength={120} list="gantt-section-options" onChange={(event) => setSectionTitle(event.target.value)} /><datalist id="gantt-section-options">{plan.sections.map((section) => <option key={section.id} value={section.title} />)}</datalist></label>
          <label><span>{text("Status", "Status")}</span><select value={status} onChange={(event) => setStatus(event.currentTarget.value as GanttTaskStatus)}>{(["none", "active", "done", "crit"] as const).map((value) => <option key={value} value={value}>{statusLabel(value, appearance, text)}</option>)}</select></label>
          <label><span>{text("Start date", "Startdatum")}</span><input type="date" value={start} disabled={Boolean(after)} onChange={(event) => {
            const nextStart = event.currentTarget.value;
            setStart(nextStart);
            setEnd((current) => current < nextStart ? nextStart : current);
          }} /></label>
          <label><span>{text("End date", "Enddatum")}</span><input type="date" value={end} min={after ? undefined : start} onChange={(event) => setEnd(event.currentTarget.value)} /></label>
          <label className="gantt-dialog-dependency"><span>{text("Dependency", "Abhängigkeit")}</span><select value={after} onChange={(event) => {
            const nextAfter = event.currentTarget.value;
            setAfter(nextAfter);
            const predecessor = scheduleById.get(nextAfter);
            if (!predecessor) return;
            const nextStart = addDays(predecessor.end, 1);
            setStart(nextStart);
            setEnd((current) => current < nextStart ? nextStart : current);
          }}><option value="">{text("No dependency", "Keine Abhängigkeit")}</option>{tasks.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label>
          <label className="gantt-dialog-progress"><span>{text("Progress", "Fortschritt")}</span><div><input type="range" min="0" max="100" step="5" value={progress} onChange={(event) => setProgress(Number(event.currentTarget.value))} /><output>{progress}%</output></div></label>
        </div>
      </div>
      <footer>
        {onDelete ? <button type="button" className="button compact danger-button" onClick={onDelete}><Trash2 size={15} />{text("Delete", "Löschen")}</button> : <span />}
        <div><button type="button" className="button compact secondary-button" onClick={onClose}>{text("Cancel", "Abbrechen")}</button><button type="button" className="button compact primary-button" disabled={!title.trim()} onClick={save}>{text("Save task", "Aufgabe speichern")}</button></div>
      </footer>
    </section>
  </div>;
}

function GanttImportRecovery({
  reason,
  readOnly,
  notice,
  inputRef,
  text,
  onImport,
}: {
  reason: string;
  readOnly: boolean;
  notice: string;
  inputRef: RefObject<HTMLInputElement | null>;
  text: Text;
  onImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}) {
  return <section className="gantt-import-recovery" aria-label={text("Gantt planner", "Gantt-Planer")}>
    <CalendarDays size={26} />
    <h2>{text("This Gantt source cannot be shown as a planner", "Dieser Gantt-Quelltext kann nicht als Planer dargestellt werden")}</h2>
    <p>{text("Atlas keeps the current document unchanged. Import a Mermaid Gantt file with YYYY-MM-DD dates to replace it with a visual plan.", "Atlas lässt das aktuelle Dokument unverändert. Importiere eine Mermaid-Gantt-Datei mit YYYY-MM-DD-Terminen, um es durch einen visuellen Plan zu ersetzen.")}</p>
    <small>{reason}</small>
    {!readOnly && <><input ref={inputRef} className="visually-hidden" type="file" accept=".gantt,.mmd,text/plain" onChange={(event) => void onImport(event)} /><button type="button" className="button primary-button" onClick={() => inputRef.current?.click()}><FileUp size={16} />{text("Import Mermaid Gantt", "Mermaid-Gantt importieren")}</button></>}
    {notice && <p className="gantt-import-notice" role="status">{notice}</p>}
  </section>;
}

function calendarRange(tasks: GanttTaskSchedule[]): CalendarRange {
  const fallback = todayIso();
  if (!tasks.length) return { start: addDays(fallback, -7), days: 28 };
  const first = tasks.reduce((earliest, task) => task.start < earliest ? task.start : earliest, tasks[0]!.start);
  const last = tasks.reduce((latest, task) => task.end > latest ? task.end : latest, tasks[0]!.end);
  const start = addDays(first, -7);
  return { start, days: Math.max(21, daysBetween(start, addDays(last, 14)) + 1) };
}

function calendarSections(plan: GanttDocument, schedules: Map<string, GanttTaskSchedule>): CalendarSection[] {
  return plan.sections.map((section) => {
    const tasks = section.tasks
      .map((task) => ({ task, schedule: schedules.get(task.id) }))
      .filter((value): value is { task: GanttTask; schedule: GanttTaskSchedule } => Boolean(value.schedule))
      .sort((left, right) => left.schedule.start.localeCompare(right.schedule.start) || left.schedule.end.localeCompare(right.schedule.end));
    const tracks: CalendarSection["tracks"] = [];
    for (const item of tasks) {
      const track = tracks.find((candidate) => {
        const last = candidate.at(-1);
        return !last || last.schedule.end < item.schedule.start;
      });
      (track ?? tracks[tracks.push([]) - 1]!).push(item);
    }
    return { id: section.id, title: section.title, tracks: tracks.length ? tracks : [[]], taskCount: tasks.length };
  });
}

function resolveSection(plan: GanttDocument, title: string) {
  const normalized = title.trim().toLocaleLowerCase();
  return plan.sections.find((section) => section.title.trim().toLocaleLowerCase() === normalized) ?? null;
}

function sectionTitleForTask(plan: GanttDocument, task: GanttTask | null) {
  if (!task) return null;
  return plan.sections.find((section) => section.id === task.sectionId)?.title ?? null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function statusLabel(status: GanttTaskStatus, appearance: GanttAppearance, text: Text) {
  const custom = appearance.statuses[status].label.trim();
  if (custom) return custom;
  switch (status) {
    case "active": return text("In progress", "In Arbeit");
    case "done": return text("Done", "Erledigt");
    case "crit": return text("Critical", "Kritisch");
    default: return text("Planned", "Geplant");
  }
}
