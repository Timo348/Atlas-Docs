"use client";

import { CalendarDays, CircleAlert, CirclePlus, Flag, GripVertical, Pencil, Search, Trash2, Users, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { type DragEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as Y from "yjs";
import { usePreferences } from "@/components/preferences-provider";
import {
  addTodoTask,
  canCompleteTodoTask,
  deleteTodoTask,
  filterTodoDependencyCandidates,
  readTodoTasks,
  setTodoChecklistItemChecked,
  TODO_COLUMNS,
  TODO_PRIORITIES,
  todoDeadlineState,
  type TodoColumn,
  type TodoPriority,
  type TodoTask,
  type TodoTaskUpdate,
  updateTodoTask,
  wouldCreateTodoDependency,
} from "@/lib/todo-board";

type Assignee = { id: string; name: string; email: string };
export function CollaborativeTodoBoard({ document, readOnly, spaceId, currentUserId }: { document: Y.Doc; readOnly: boolean; spaceId?: string; currentUserId?: string }) {
  const { preferences, text } = usePreferences();
  const searchParams = useSearchParams();
  const focusedTaskId = searchParams.get("task");
  const lastFocusedTask = useRef<string | null>(null);
  const [members, setMembers] = useState<Assignee[]>([]);
  const [revision, setRevision] = useState(0);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dialogTask, setDialogTask] = useState<TodoTask | "create" | null>(null);
  const [completionBlockedTaskId, setCompletionBlockedTaskId] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const tasks = useMemo(() => readTodoTasks(document), [document, revision]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  useEffect(() => {
    if (!spaceId) return;
    let active = true;
    fetch(`/api/calendar/spaces/${encodeURIComponent(spaceId)}/members`).then(async (assignmentResponse) => {
      if (!assignmentResponse.ok) return;
      const result = await assignmentResponse.json() as { members: Assignee[] };
      if (active) setMembers(result.members);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [spaceId]);
  useEffect(() => {
    if (!focusedTaskId || !taskById.has(focusedTaskId) || lastFocusedTask.current === focusedTaskId) return;
    const card = window.document.getElementById(`todo-task-${focusedTaskId}`);
    if (!card) return;
    lastFocusedTask.current = focusedTaskId;
    card?.scrollIntoView({ block: "center" });
    card?.focus({ preventScroll: true });
  }, [focusedTaskId, taskById]);

  useEffect(() => {
    const board = document.getMap("todo-board");
    const rerender = () => setRevision((value) => value + 1);
    board.observeDeep(rerender);
    return () => board.unobserveDeep(rerender);
  }, [document]);

  function moveTask(id: string, column: TodoColumn) {
    if (readOnly) return;
    if (column === "COMPLETED" && !canCompleteTodoTask(document, id)) {
      setCompletionBlockedTaskId(id);
      return;
    }
    setCompletionBlockedTaskId(null);
    updateTodoTask(document, id, { column });
  }

  function saveTask(input: { title: string; description: string; column: TodoColumn; priority: TodoPriority; deadline: string | null; blockedBy: string[]; assigneeIds: string[] }) {
    if (readOnly) return;
    const saved = dialogTask === "create"
      ? Boolean(addTodoTask(document, input))
      : dialogTask ? updateTodoTask(document, dialogTask.id, input) : false;
    if (!saved) {
      setDialogError(text("Complete prerequisite tasks first and avoid circular dependencies.", "Schließe zuerst Abhängigkeiten ab und vermeide Kreisabhängigkeiten."));
      return;
    }
    setDialogError(null);
    setDialogTask(null);
  }

  return (
    <section className="todo-board" aria-label={text("Todo board", "Todo-Board")}>
      <header className="todo-board-header">
        <div>
          <span className="todo-board-kicker">Atlas</span>
          <h2>{text("Project tasks", "Projektaufgaben")}</h2>
          <p>{text("Priority sorts every column. Drag cards or select a status.", "Priorität sortiert jede Spalte. Ziehe Karten oder wähle einen Status.")}</p>
        </div>
        {!readOnly && <button className="button primary-button todo-create-button" type="button" onClick={() => { setDialogError(null); setDialogTask("create"); }}><CirclePlus size={16} />{text("Add task", "Aufgabe hinzufügen")}</button>}
      </header>
      <div className="todo-columns">
        {TODO_COLUMNS.map((column) => {
          const columnTasks = tasks.filter((task) => task.column === column);
          return (
            <section
              className={`todo-column todo-column-${column.toLowerCase()}`}
              key={column}
              onDragOver={(event) => !readOnly && event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const taskId = draggedTask || event.dataTransfer.getData("text/plain");
                if (taskId) moveTask(taskId, column);
                setDraggedTask(null);
              }}
            >
              <header className="todo-column-header"><strong>{columnLabel(column, text)}</strong><span>{columnTasks.length}</span></header>
              <div className="todo-column-cards">
                {columnTasks.map((task) => (
                  <TodoCard
                    key={task.id}
                    task={task}
                    focused={task.id === focusedTaskId}
                    members={members}
                    readOnly={readOnly}
                    language={preferences.language}
                    text={text}
                    blockers={task.blockedBy.flatMap((dependencyId) => {
                      const dependency = taskById.get(dependencyId);
                      return dependency && dependency.column !== "COMPLETED" ? [dependency] : [];
                    })}
                    completionBlocked={completionBlockedTaskId === task.id}
                    onMove={moveTask}
                    onDelete={(id) => !readOnly && deleteTodoTask(document, id)}
                    onEdit={(item) => {
                      if (readOnly) return;
                      setDialogError(null);
                      setDialogTask(item);
                    }}
                    onUpdate={(id, update) => !readOnly && updateTodoTask(document, id, update)}
                    onDragStart={(event, id) => {
                      if (readOnly) return;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", id);
                      setDraggedTask(id);
                    }}
                    onDragEnd={() => setDraggedTask(null)}
                  />
                ))}
                {!columnTasks.length && <p className="todo-column-empty">{text("No tasks", "Keine Aufgaben")}</p>}
              </div>
            </section>
          );
        })}
      </div>
      {dialogTask && <TodoTaskDialog existing={dialogTask === "create" ? null : dialogTask} tasks={tasks} document={document} members={members} currentUserId={currentUserId} error={dialogError} text={text} onClose={() => setDialogTask(null)} onSave={saveTask} />}
    </section>
  );
}

function TodoCard({
  task,
  focused,
  members,
  readOnly,
  language,
  text,
  blockers,
  completionBlocked,
  onMove,
  onDelete,
  onEdit,
  onUpdate,
  onDragStart,
  onDragEnd,
}: {
  task: TodoTask;
  focused: boolean;
  members: Assignee[];
  readOnly: boolean;
  language: "en" | "de";
  text: (english: string, german: string) => string;
  blockers: TodoTask[];
  completionBlocked: boolean;
  onMove: (id: string, column: TodoColumn) => void;
  onDelete: (id: string) => void;
  onEdit: (task: TodoTask) => void;
  onUpdate: (id: string, update: TodoTaskUpdate) => void;
  onDragStart: (event: DragEvent<HTMLElement>, id: string) => void;
  onDragEnd: () => void;
}) {
  const deadlineState = todoDeadlineState(task);
  return (
    <article id={`todo-task-${task.id}`} tabIndex={focused ? -1 : undefined} data-focused={focused} className={`todo-card todo-priority-${task.priority.toLowerCase()}`} draggable={!readOnly} onDragStart={(event) => onDragStart(event, task.id)} onDragEnd={onDragEnd}>
      <header>
        <span className="todo-drag-handle" aria-hidden="true"><GripVertical size={15} /></span>
        <span className="todo-priority-badge"><Flag size={12} />{priorityLabel(task.priority, text)}</span>
        {!readOnly && <div className="todo-card-actions"><button className="todo-edit-button" type="button" onClick={() => onEdit(task)} title={text("Edit task", "Aufgabe bearbeiten")} aria-label={text("Edit task", "Aufgabe bearbeiten")}><Pencil size={14} /></button><button className="todo-delete-button" type="button" onClick={() => onDelete(task.id)} title={text("Delete task", "Aufgabe löschen")} aria-label={text("Delete task", "Aufgabe löschen")}><Trash2 size={14} /></button></div>}
      </header>
      <strong className="todo-task-title">{task.title}</strong>
      <p className="todo-task-assignees"><Users size={12} /> {task.assigneeIds.length ? task.assigneeIds.map((id) => members.find((member) => member.id === id)?.name || text("Assigned member", "Zugewiesenes Mitglied")).join(", ") : text("Unassigned", "Nicht zugewiesen")}</p>
      {task.description && <div className="todo-card-description"><TodoMarkdown description={task.description} readOnly={readOnly} text={text} onChecklistChange={(index, checked) => onUpdate(task.id, { description: setTodoChecklistItemChecked(task.description, index, checked) })} /></div>}
      {blockers.length > 0 && <p className="todo-task-blocked"><CircleAlert size={14} />{completionBlocked ? text("Complete these tasks first:", "Erledige zuerst diese Aufgaben:") : text("Waiting for:", "Wartet auf:")} {blockers.map((blocker) => blocker.title).join(", ")}</p>}
      <div className="todo-card-fields">
        <label><span>{text("Priority", "Priorität")}</span><select value={task.priority} disabled={readOnly} onChange={(event) => onUpdate(task.id, { priority: event.target.value as TodoPriority })}>{TODO_PRIORITIES.map((item) => <option key={item} value={item}>{priorityLabel(item, text)}</option>)}</select></label>
        <label><span>{text("Deadline", "Frist")}</span><input type="date" value={task.deadline || ""} disabled={readOnly} onChange={(event) => onUpdate(task.id, { deadline: event.target.value || null })} /></label>
      </div>
      <footer>
        <label><span>{text("Status", "Status")}</span><select value={task.column} disabled={readOnly} onChange={(event) => onMove(task.id, event.target.value as TodoColumn)}>{TODO_COLUMNS.map((item) => <option key={item} value={item}>{columnLabel(item, text)}</option>)}</select></label>
        {task.deadline && <span className={`todo-deadline todo-deadline-${deadlineState}`}><CalendarDays size={13} />{deadlineLabel(task.deadline, deadlineState, language, text)}</span>}
      </footer>
    </article>
  );
}

function TodoTaskDialog({
  existing,
  tasks,
  document,
  members,
  currentUserId,
  error,
  text,
  onClose,
  onSave,
}: {
  existing: TodoTask | null;
  tasks: TodoTask[];
  document: Y.Doc;
  members: Assignee[];
  currentUserId?: string;
  error: string | null;
  text: (english: string, german: string) => string;
  onClose: () => void;
  onSave: (input: { title: string; description: string; column: TodoColumn; priority: TodoPriority; deadline: string | null; blockedBy: string[]; assigneeIds: string[] }) => void;
}) {
  const [title, setTitle] = useState(existing?.title || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [column, setColumn] = useState<TodoColumn>(existing?.column || "NEW");
  const [priority, setPriority] = useState<TodoPriority>(existing?.priority || "MEDIUM");
  const [deadline, setDeadline] = useState(existing?.deadline || "");
  const [blockedBy, setBlockedBy] = useState<string[]>(existing?.blockedBy || []);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(existing?.assigneeIds || (currentUserId ? [currentUserId] : []));
  const [dependencyQuery, setDependencyQuery] = useState("");
  const [hideCompletedDependencies, setHideCompletedDependencies] = useState(false);
  const editMode = Boolean(existing);
  const dependencyCandidates = tasks.filter((task) => !existing || (task.id !== existing.id && !wouldCreateTodoDependency(document, existing.id, task.id)));
  const visibleDependencyCandidates = filterTodoDependencyCandidates(
    dependencyCandidates,
    dependencyQuery,
    hideCompletedDependencies,
    blockedBy,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    onSave({ title, description, column, priority, deadline: deadline || null, blockedBy, assigneeIds });
  }

  return <div className="modal-backdrop todo-task-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="todo-task-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-label={editMode ? text("Edit task", "Aufgabe bearbeiten") : text("New task", "Neue Aufgabe")}>
      <header>
        <div><span>Atlas</span><h2>{editMode ? text("Edit task", "Aufgabe bearbeiten") : text("New task", "Neue Aufgabe")}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={text("Close", "Schließen")}><X size={18} /></button>
      </header>
      <div className="todo-task-dialog-body">
        <label className="todo-dialog-title"><span>{text("Task title", "Aufgabentitel")}</span><input autoFocus value={title} maxLength={240} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="todo-dialog-description"><span>{text("Description (Markdown)", "Beschreibung (Markdown)")}</span><textarea value={description} maxLength={12000} onChange={(event) => setDescription(event.target.value)} placeholder={text("Use Markdown, for example **important** or a checklist.", "Nutze Markdown, zum Beispiel **wichtig** oder eine Checkliste.")} /></label>
        {description.trim() && <section className="todo-description-preview" aria-label={text("Description preview", "Beschreibungsvorschau")}><span>{text("Preview", "Vorschau")}</span><TodoMarkdown description={description} readOnly={false} text={text} onChecklistChange={(index, checked) => setDescription(setTodoChecklistItemChecked(description, index, checked))} /></section>}
        <div className="todo-dialog-grid">
          <label><span>{text("Status", "Status")}</span><select value={column} onChange={(event) => setColumn(event.target.value as TodoColumn)}>{TODO_COLUMNS.map((item) => <option key={item} value={item}>{columnLabel(item, text)}</option>)}</select></label>
          <label><span>{text("Priority", "Priorität")}</span><select value={priority} onChange={(event) => setPriority(event.target.value as TodoPriority)}>{TODO_PRIORITIES.map((item) => <option key={item} value={item}>{priorityLabel(item, text)}</option>)}</select></label>
          <label><span>{text("Deadline", "Frist")}</span><input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
        </div>
        <fieldset className="todo-dialog-dependencies"><legend>{text("Assigned to", "Zuständig")}</legend><div className="todo-assignee-list">{members.map((member) => <label key={member.id}><input type="checkbox" checked={assigneeIds.includes(member.id)} onChange={(event) => setAssigneeIds(event.target.checked ? [...assigneeIds, member.id] : assigneeIds.filter((id) => id !== member.id))} />{member.name || member.email}</label>)}<button className="button compact secondary-button" type="button" onClick={() => setAssigneeIds([])}>{text("Unassign all", "Zuweisungen entfernen")}</button></div></fieldset>
        <fieldset className="todo-dialog-dependencies">
          <legend>{text("Must be completed first", "Muss zuerst erledigt werden")}</legend>
          <p>{text("The task cannot be completed until every selected task is completed.", "Diese Aufgabe kann erst erledigt werden, wenn alle ausgewählten Aufgaben erledigt sind.")}</p>
          <div className="todo-dependency-filters">
            <label className="todo-dependency-search"><Search size={14} aria-hidden="true" /><input value={dependencyQuery} onChange={(event) => setDependencyQuery(event.target.value)} placeholder={text("Search tasks", "Aufgaben suchen")} aria-label={text("Search dependency tasks", "Abhängigkeiten suchen")} /></label>
            <label className="todo-dependency-toggle"><input type="checkbox" checked={hideCompletedDependencies} onChange={(event) => setHideCompletedDependencies(event.target.checked)} /><span>{text("Hide completed", "Erledigte ausblenden")}</span></label>
          </div>
          <div className="todo-dependency-options">
            {visibleDependencyCandidates.map((task) => <label key={task.id}><input type="checkbox" checked={blockedBy.includes(task.id)} onChange={(event) => setBlockedBy((current) => event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id))} /><span>{task.title}</span><small>{task.column === "COMPLETED" ? text("Completed", "Erledigt") : columnLabel(task.column, text)}</small></label>)}
            {!visibleDependencyCandidates.length && <span className="todo-dependency-empty">{dependencyCandidates.length ? text("No tasks match this filter", "Keine Aufgabe passt zu diesem Filter") : text("No eligible tasks", "Keine passenden Aufgaben")}</span>}
          </div>
        </fieldset>
        {error && <p className="todo-dialog-error" role="alert">{error}</p>}
      </div>
      <footer><button type="button" className="button" onClick={onClose}>{text("Cancel", "Abbrechen")}</button><button className="button primary-button" disabled={!title.trim()}>{editMode ? text("Save changes", "Änderungen speichern") : text("Create task", "Aufgabe erstellen")}</button></footer>
    </form>
  </div>;
}

function TodoMarkdown({
  description,
  readOnly,
  text,
  onChecklistChange,
}: {
  description: string;
  readOnly: boolean;
  text: (english: string, german: string) => string;
  onChecklistChange?: (checklistItemIndex: number, checked: boolean) => void;
}) {
  let nextChecklistItemIndex = 0;
  return <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      input: ({ type, checked, ...props }) => {
        if (type !== "checkbox") return <input {...props} type={type} checked={checked} />;
        const checklistItemIndex = nextChecklistItemIndex;
        nextChecklistItemIndex += 1;
        const canToggle = !readOnly && Boolean(onChecklistChange);
        return <input
          {...props}
          aria-label={text("Toggle checklist item", "Checklistenpunkt umschalten")}
          checked={checked === true}
          className="todo-checklist-input"
          disabled={!canToggle}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            event.stopPropagation();
            onChecklistChange?.(checklistItemIndex, event.currentTarget.checked);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          type="checkbox"
        />;
      },
    }}
  >{description}</ReactMarkdown>;
}

function columnLabel(column: TodoColumn, text: (english: string, german: string) => string) {
  switch (column) {
    case "NEW": return text("New task", "Neu");
    case "SCHEDULED": return text("Scheduled", "Geplant");
    case "IN_PROGRESS": return text("In progress", "In Arbeit");
    case "COMPLETED": return text("Completed", "Erledigt");
  }
}

function priorityLabel(priority: TodoPriority, text: (english: string, german: string) => string) {
  switch (priority) {
    case "URGENT": return text("Urgent", "Dringend");
    case "HIGH": return text("High", "Hoch");
    case "MEDIUM": return text("Medium", "Mittel");
    case "LOW": return text("Low", "Niedrig");
  }
}

function deadlineLabel(
  deadline: string,
  state: ReturnType<typeof todoDeadlineState>,
  language: "en" | "de",
  text: (english: string, german: string) => string,
) {
  if (state === "overdue") return text("Overdue", "Überfällig");
  if (state === "today") return text("Due today", "Heute fällig");
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${deadline}T12:00:00`));
}
