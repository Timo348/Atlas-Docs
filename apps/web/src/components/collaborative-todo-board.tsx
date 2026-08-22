"use client";

import { CalendarDays, CirclePlus, Flag, GripVertical, Trash2 } from "lucide-react";
import { type DragEvent, type FormEvent, useEffect, useMemo, useState } from "react";
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
  updateTodoTask,
} from "@/lib/todo-board";

export function CollaborativeTodoBoard({ document, readOnly }: { document: Y.Doc; readOnly: boolean }) {
  const { preferences, text } = usePreferences();
  const [revision, setRevision] = useState(0);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TodoPriority>("MEDIUM");
  const [deadline, setDeadline] = useState("");
  const tasks = useMemo(() => readTodoTasks(document), [document, revision]);

  useEffect(() => {
    const board = document.getMap("todo-board");
    const rerender = () => setRevision((value) => value + 1);
    board.observeDeep(rerender);
    return () => board.unobserveDeep(rerender);
  }, [document]);

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || !title.trim()) return;
    addTodoTask(document, { title, priority, deadline: deadline || null });
    setTitle("");
    setPriority("MEDIUM");
    setDeadline("");
  }

  function moveTask(id: string, column: TodoColumn) {
    if (!readOnly) updateTodoTask(document, id, { column });
  }

  return (
    <section className="todo-board" aria-label={text("Todo board", "Todo-Board")}>
      <header className="todo-board-header">
        <div>
          <span className="todo-board-kicker">Atlas</span>
          <h2>{text("Project tasks", "Projektaufgaben")}</h2>
          <p>{text("Priority sorts every column. Drag cards or select a status.", "Priorität sortiert jede Spalte. Ziehe Karten oder wähle einen Status.")}</p>
        </div>
        <form className="todo-create-form" onSubmit={createTask}>
          <input
            value={title}
            disabled={readOnly}
            maxLength={240}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={text("New task", "Neue Aufgabe")}
            aria-label={text("New task title", "Titel neuer Aufgabe")}
          />
          <select value={priority} disabled={readOnly} onChange={(event) => setPriority(event.target.value as TodoPriority)} aria-label={text("Task priority", "Aufgabenpriorität")}>
            {TODO_PRIORITIES.map((item) => <option key={item} value={item}>{priorityLabel(item, text)}</option>)}
          </select>
          <input type="date" value={deadline} disabled={readOnly} onChange={(event) => setDeadline(event.target.value)} aria-label={text("Task deadline", "Aufgabenfrist")} />
          <button className="button primary-button" disabled={readOnly || !title.trim()}><CirclePlus size={16} />{text("Add task", "Aufgabe hinzufügen")}</button>
        </form>
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
  onUpdate: (id: string, update: { title?: string; priority?: TodoPriority; deadline?: string | null }) => void;
  onDragStart: (event: DragEvent<HTMLElement>, id: string) => void;
  onDragEnd: () => void;
}) {
  const deadlineState = todoDeadlineState(task);
  return (
    <article className={`todo-card todo-priority-${task.priority.toLowerCase()}`} draggable={!readOnly} onDragStart={(event) => onDragStart(event, task.id)} onDragEnd={onDragEnd}>
      <header>
        <span className="todo-drag-handle" aria-hidden="true"><GripVertical size={15} /></span>
        <span className="todo-priority-badge"><Flag size={12} />{priorityLabel(task.priority, text)}</span>
        {!readOnly && <button className="todo-delete-button" type="button" onClick={() => onDelete(task.id)} title={text("Delete task", "Aufgabe löschen")} aria-label={text("Delete task", "Aufgabe löschen")}><Trash2 size={14} /></button>}
      </header>
      <input
        className="todo-task-title"
        defaultValue={task.title}
        key={`${task.id}:${task.title}`}
        readOnly={readOnly}
        maxLength={240}
        onBlur={(event) => onUpdate(task.id, { title: event.currentTarget.value })}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        aria-label={text("Task title", "Aufgabentitel")}
      />
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
