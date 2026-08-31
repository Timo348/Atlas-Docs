"use client";

import { CalendarDays, CirclePlus, Flag, GripVertical, Pencil, Trash2, X } from "lucide-react";
import { type DragEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as Y from "yjs";
import { usePreferences } from "@/components/preferences-provider";
import {
  addTodoTask,
  deleteTodoTask,
  readTodoTasks,
  TODO_COLUMNS,
  TODO_PRIORITIES,
  todoDeadlineState,
  type TodoColumn,
  type TodoPriority,
  type TodoTask,
  type TodoTaskUpdate,
  updateTodoTask,
} from "@/lib/todo-board";

export function CollaborativeTodoBoard({ document, readOnly }: { document: Y.Doc; readOnly: boolean }) {
  const { preferences, text } = usePreferences();
  const [revision, setRevision] = useState(0);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dialogTask, setDialogTask] = useState<TodoTask | "create" | null>(null);
  const tasks = useMemo(() => readTodoTasks(document), [document, revision]);

  useEffect(() => {
    const board = document.getMap("todo-board");
    const rerender = () => setRevision((value) => value + 1);
    board.observeDeep(rerender);
    return () => board.unobserveDeep(rerender);
  }, [document]);

  function moveTask(id: string, column: TodoColumn) {
    if (!readOnly) updateTodoTask(document, id, { column });
  }

  function saveTask(input: { title: string; description: string; column: TodoColumn; priority: TodoPriority; deadline: string | null }) {
    if (readOnly) return;
    if (dialogTask === "create") addTodoTask(document, input);
    else if (dialogTask) updateTodoTask(document, dialogTask.id, input);
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
        {!readOnly && <button className="button primary-button todo-create-button" type="button" onClick={() => setDialogTask("create")}><CirclePlus size={16} />{text("Add task", "Aufgabe hinzufügen")}</button>}
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
                    readOnly={readOnly}
                    language={preferences.language}
                    text={text}
                    onMove={moveTask}
                    onDelete={(id) => !readOnly && deleteTodoTask(document, id)}
                    onEdit={(item) => !readOnly && setDialogTask(item)}
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
      {dialogTask && <TodoTaskDialog existing={dialogTask === "create" ? null : dialogTask} text={text} onClose={() => setDialogTask(null)} onSave={saveTask} />}
    </section>
  );
}

function TodoCard({
  task,
  readOnly,
  language,
  text,
  onMove,
  onDelete,
  onEdit,
  onUpdate,
  onDragStart,
  onDragEnd,
}: {
  task: TodoTask;
  readOnly: boolean;
  language: "en" | "de";
  text: (english: string, german: string) => string;
  onMove: (id: string, column: TodoColumn) => void;
  onDelete: (id: string) => void;
  onEdit: (task: TodoTask) => void;
  onUpdate: (id: string, update: TodoTaskUpdate) => void;
  onDragStart: (event: DragEvent<HTMLElement>, id: string) => void;
  onDragEnd: () => void;
}) {
  const deadlineState = todoDeadlineState(task);
  return (
    <article className={`todo-card todo-priority-${task.priority.toLowerCase()}`} draggable={!readOnly} onDragStart={(event) => onDragStart(event, task.id)} onDragEnd={onDragEnd}>
      <header>
        <span className="todo-drag-handle" aria-hidden="true"><GripVertical size={15} /></span>
        <span className="todo-priority-badge"><Flag size={12} />{priorityLabel(task.priority, text)}</span>
        {!readOnly && <div className="todo-card-actions"><button className="todo-edit-button" type="button" onClick={() => onEdit(task)} title={text("Edit task", "Aufgabe bearbeiten")} aria-label={text("Edit task", "Aufgabe bearbeiten")}><Pencil size={14} /></button><button className="todo-delete-button" type="button" onClick={() => onDelete(task.id)} title={text("Delete task", "Aufgabe löschen")} aria-label={text("Delete task", "Aufgabe löschen")}><Trash2 size={14} /></button></div>}
      </header>
      <strong className="todo-task-title">{task.title}</strong>
      {task.description && <div className="todo-card-description"><ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown></div>}
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
  text,
  onClose,
  onSave,
}: {
  existing: TodoTask | null;
  text: (english: string, german: string) => string;
  onClose: () => void;
  onSave: (input: { title: string; description: string; column: TodoColumn; priority: TodoPriority; deadline: string | null }) => void;
}) {
  const [title, setTitle] = useState(existing?.title || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [column, setColumn] = useState<TodoColumn>(existing?.column || "NEW");
  const [priority, setPriority] = useState<TodoPriority>(existing?.priority || "MEDIUM");
  const [deadline, setDeadline] = useState(existing?.deadline || "");
  const editMode = Boolean(existing);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    onSave({ title, description, column, priority, deadline: deadline || null });
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
        {description.trim() && <section className="todo-description-preview" aria-label={text("Description preview", "Beschreibungsvorschau")}><span>{text("Preview", "Vorschau")}</span><ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown></section>}
        <div className="todo-dialog-grid">
          <label><span>{text("Status", "Status")}</span><select value={column} onChange={(event) => setColumn(event.target.value as TodoColumn)}>{TODO_COLUMNS.map((item) => <option key={item} value={item}>{columnLabel(item, text)}</option>)}</select></label>
          <label><span>{text("Priority", "Priorität")}</span><select value={priority} onChange={(event) => setPriority(event.target.value as TodoPriority)}>{TODO_PRIORITIES.map((item) => <option key={item} value={item}>{priorityLabel(item, text)}</option>)}</select></label>
          <label><span>{text("Deadline", "Frist")}</span><input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
        </div>
      </div>
      <footer><button type="button" className="button" onClick={onClose}>{text("Cancel", "Abbrechen")}</button><button className="button primary-button" disabled={!title.trim()}>{editMode ? text("Save changes", "Änderungen speichern") : text("Create task", "Aufgabe erstellen")}</button></footer>
    </form>
  </div>;
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
