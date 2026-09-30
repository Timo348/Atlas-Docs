import * as Y from "yjs";

export const TODO_BOARD_MAP = "todo-board";
const TODO_TASKS_KEY = "tasks";
const TODO_BOARD_VERSION = 1;

export const TODO_COLUMNS = ["NEW", "SCHEDULED", "IN_PROGRESS", "COMPLETED"] as const;
export type TodoColumn = typeof TODO_COLUMNS[number];
export const TODO_PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
export type TodoPriority = typeof TODO_PRIORITIES[number];

export type TodoTask = {
  id: string;
  title: string;
  description: string;
  column: TodoColumn;
  priority: TodoPriority;
  deadline: string | null;
  blockedBy: string[];
  assigneeIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type TodoTaskUpdate = Partial<Pick<TodoTask, "title" | "description" | "column" | "priority" | "deadline" | "blockedBy" | "assigneeIds">>;

export function initializeTodoBoard(document: Y.Doc) {
  const board = document.getMap<unknown>(TODO_BOARD_MAP);
  if (board.has("version")) return false;
  document.transact(() => {
    board.set("version", TODO_BOARD_VERSION);
    board.set(TODO_TASKS_KEY, new Y.Map<unknown>());
  }, "initialize-todo-board");
  return true;
}

export function readTodoTasks(document: Y.Doc) {
  const tasks = readTaskMap(document);
  if (!tasks) return [];
  const entries = Array.from(tasks.entries());
  const knownTaskIds = new Set(entries.map(([id]) => id));
  return entries
    .flatMap(([id, value]) => {
      const task = toTodoTask(id, value, knownTaskIds);
      return task ? [task] : [];
    })
    .sort(compareTodoTasks);
}

export function addTodoTask(
  document: Y.Doc,
  input: { title: string; description?: string; column?: TodoColumn; priority?: TodoPriority; deadline?: string | null; blockedBy?: string[]; assigneeIds?: string[] },
) {
  const title = normalizeTitle(input.title);
  if (!title) return null;
  const tasks = ensureTaskMap(document);
  const blockedBy = normalizeTodoDependencies(input.blockedBy, new Set(tasks.keys()));
  const column = isTodoColumn(input.column) ? input.column : "NEW";
  if (column === "COMPLETED" && !todoDependenciesAreCompleted(tasks, blockedBy)) return null;
  const id = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  const task = new Y.Map<unknown>();
  task.set("title", title);
  task.set("description", normalizeDescription(input.description));
  task.set("column", column);
  task.set("priority", isTodoPriority(input.priority) ? input.priority : "MEDIUM");
  task.set("deadline", normalizeDeadline(input.deadline));
  task.set("blockedBy", blockedBy);
  task.set("assigneeIds", normalizeTodoAssignees(input.assigneeIds));
  task.set("createdAt", now);
  task.set("updatedAt", now);
  document.transact(() => tasks.set(id, task), "add-todo-task");
  return id;
}

export function updateTodoTask(document: Y.Doc, id: string, update: TodoTaskUpdate) {
  const tasks = readTaskMap(document);
  if (!tasks) return false;
  const task = tasks.get(id);
  if (!(task instanceof Y.Map)) return false;
  const nextTitle = update.title === undefined ? undefined : normalizeTitle(update.title);
  if (update.title !== undefined && !nextTitle) return false;
  const blockedBy = update.blockedBy === undefined
    ? normalizeTodoDependencies(task.get("blockedBy"), new Set(tasks.keys()), id)
    : normalizeTodoDependencies(update.blockedBy, new Set(tasks.keys()), id);
  if (blockedBy.some((dependencyId) => wouldCreateTodoDependency(document, id, dependencyId))) return false;
  const column = update.column === undefined ? task.get("column") : update.column;
  if (column === "COMPLETED" && !todoDependenciesAreCompleted(tasks, blockedBy)) return false;
  document.transact(() => {
    if (nextTitle !== undefined) task.set("title", nextTitle);
    if (update.description !== undefined) task.set("description", normalizeDescription(update.description));
    if (update.column !== undefined && isTodoColumn(update.column)) task.set("column", update.column);
    if (update.priority !== undefined && isTodoPriority(update.priority)) task.set("priority", update.priority);
    if (update.deadline !== undefined) task.set("deadline", normalizeDeadline(update.deadline));
    if (update.blockedBy !== undefined) task.set("blockedBy", blockedBy);
    if (update.assigneeIds !== undefined) task.set("assigneeIds", normalizeTodoAssignees(update.assigneeIds));
    task.set("updatedAt", Date.now());
  }, "update-todo-task");
  return true;
}

export function deleteTodoTask(document: Y.Doc, id: string) {
  const tasks = readTaskMap(document);
  if (!tasks?.has(id)) return false;
  document.transact(() => {
    for (const [taskId, value] of tasks.entries()) {
      if (taskId === id || !(value instanceof Y.Map)) continue;
      const blockedBy = normalizeTodoDependencies(value.get("blockedBy"), new Set(tasks.keys()), taskId);
      if (blockedBy.includes(id)) {
        value.set("blockedBy", blockedBy.filter((dependencyId) => dependencyId !== id));
        value.set("updatedAt", Date.now());
      }
    }
    tasks.delete(id);
  }, "delete-todo-task");
  return true;
}

export function canCompleteTodoTask(document: Y.Doc, id: string) {
  const tasks = readTaskMap(document);
  const task = tasks?.get(id);
  if (!(task instanceof Y.Map) || !tasks) return false;
  const blockedBy = normalizeTodoDependencies(task.get("blockedBy"), new Set(tasks.keys()), id);
  return todoDependenciesAreCompleted(tasks, blockedBy);
}

export function todoTaskBlockers(document: Y.Doc, id: string) {
  const tasks = new Map(readTodoTasks(document).map((task) => [task.id, task]));
  const task = tasks.get(id);
  if (!task) return [];
  return task.blockedBy.flatMap((dependencyId) => {
    const dependency = tasks.get(dependencyId);
    return dependency && dependency.column !== "COMPLETED" ? [dependency] : [];
  });
}

export function wouldCreateTodoDependency(document: Y.Doc, id: string, dependencyId: string) {
  if (id === dependencyId) return true;
  const tasks = new Map(readTodoTasks(document).map((task) => [task.id, task]));
  if (!tasks.has(id) || !tasks.has(dependencyId)) return true;
  return todoTaskDependsOn(tasks, dependencyId, id, new Set());
}

export function filterTodoDependencyCandidates(
  tasks: readonly TodoTask[],
  query = "",
  hideCompleted = false,
  selectedIds: readonly string[] = [],
) {
  const needle = query.trim().toLocaleLowerCase();
  const selected = new Set(selectedIds);
  return tasks.filter((task) => {
    const matchesQuery = !needle || task.title.toLocaleLowerCase().includes(needle);
    const visibleStatus = !hideCompleted || task.column !== "COMPLETED" || selected.has(task.id);
    return matchesQuery && visibleStatus;
  });
}

export function compareTodoTasks(left: TodoTask, right: TodoTask) {
  const priorityDifference = priorityRank(right.priority) - priorityRank(left.priority);
  if (priorityDifference) return priorityDifference;
  const deadlineDifference = deadlineRank(left.deadline) - deadlineRank(right.deadline);
  if (deadlineDifference) return deadlineDifference;
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

export function todoDeadlineState(task: TodoTask, now = new Date()) {
  if (!task.deadline || task.column === "COMPLETED") return "none" as const;
  const today = localDateKey(now);
  if (task.deadline < today) return "overdue" as const;
  if (task.deadline === today) return "today" as const;
  return "upcoming" as const;
}

export function setTodoChecklistItemChecked(markdown: string, checklistItemIndex: number, checked: boolean) {
  if (!Number.isInteger(checklistItemIndex) || checklistItemIndex < 0) return markdown;
  let currentIndex = -1;
  return markdown.replace(/^(\s*(?:[-+*]|\d+[.)])\s+\[)([ xX])(\])/gm, (match, prefix: string, _current: string, suffix: string) => {
    currentIndex += 1;
    return currentIndex === checklistItemIndex ? `${prefix}${checked ? "x" : " "}${suffix}` : match;
  });
}

export function serializeTodoBoard(document: Y.Doc) {
  return `${JSON.stringify({
    format: "atlas-todos",
    version: TODO_BOARD_VERSION,
    tasks: readTodoTasks(document),
  }, null, 2)}\n`;
}

export function serializeTodoBoardState(data: Uint8Array | null | undefined) {
  const document = new Y.Doc();
  try {
    if (data?.byteLength) Y.applyUpdate(document, data);
    return serializeTodoBoard(document);
  } finally {
    document.destroy();
  }
}

/** Rebuild a portable export without silently dropping task identity or invalid records. */
export function createTodoBoardStateFromJson(json: string) {
  let input: unknown;
  try { input = JSON.parse(json); } catch { throw new TodoBoardDecodeError("Invalid Todo JSON."); }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TodoBoardDecodeError("Invalid Todo export.");
  const board = input as Record<string, unknown>;
  if (board.format !== "atlas-todos" || board.version !== TODO_BOARD_VERSION || !Array.isArray(board.tasks)) {
    throw new TodoBoardDecodeError("Unsupported Todo export format or version.");
  }
  const ids = new Set<string>();
  const records = board.tasks.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TodoBoardDecodeError("Invalid exported Todo task.");
    const task = value as Record<string, unknown>;
    if (typeof task.id !== "string" || !task.id || task.id.length > 200 || ids.has(task.id)) throw new TodoBoardDecodeError("Invalid or duplicate exported Todo task ID.");
    ids.add(task.id);
    if (typeof task.title !== "string" || !task.title.trim() || task.title.length > 240
      || (task.description !== undefined && (typeof task.description !== "string" || task.description.length > 12000))
      || !isTodoColumn(task.column) || !isTodoPriority(task.priority)) throw new TodoBoardDecodeError(`Invalid exported Todo content for ${task.id}.`);
    if (task.deadline !== null && task.deadline !== undefined && normalizeDeadline(task.deadline) !== task.deadline) throw new TodoBoardDecodeError(`Invalid exported Todo date for ${task.id}.`);
    for (const field of ["blockedBy", "assigneeIds"]) {
      const list = task[field];
      if (list !== undefined && (!Array.isArray(list) || list.some((id) => typeof id !== "string" || !id || id.length > 200))) throw new TodoBoardDecodeError(`Invalid exported Todo ${field} for ${task.id}.`);
    }
    for (const field of ["createdAt", "updatedAt"]) {
      const time = task[field];
      if (time !== undefined && (typeof time !== "number" || !Number.isSafeInteger(time) || time < 0)) throw new TodoBoardDecodeError(`Invalid exported Todo timestamp for ${task.id}.`);
    }
    return task;
  });
  const document = new Y.Doc();
  try {
    initializeTodoBoard(document);
    const tasks = readTaskMap(document)!;
    document.transact(() => {
      for (const item of records) {
        const id = item.id as string;
        const blockedBy = (item.blockedBy || []) as string[];
        if (blockedBy.some((dependency) => !ids.has(dependency) || dependency === id)) throw new TodoBoardDecodeError(`Invalid exported Todo dependency for ${id}.`);
        const task = new Y.Map<unknown>();
        task.set("title", item.title);
        task.set("description", item.description || "");
        task.set("column", item.column);
        task.set("priority", item.priority);
        task.set("deadline", item.deadline || null);
        task.set("blockedBy", [...new Set(blockedBy)]);
        task.set("assigneeIds", normalizeTodoAssignees(item.assigneeIds));
        task.set("createdAt", item.createdAt ?? 0);
        task.set("updatedAt", item.updatedAt ?? 0);
        tasks.set(id, task);
      }
    }, "import-todo-board");
    validateTodoTaskChanges([], readTodoTasksForIndex(document));
    return Y.encodeStateAsUpdate(document);
  } finally {
    document.destroy();
  }
}

/** Copies only visible Todo state. Stale tasks vanish when a version is restored. */
export function copyTodoBoard(source: Y.Doc, target: Y.Doc) {
  const tasks = readTodoTasks(source);
  const targetBoard = target.getMap<unknown>(TODO_BOARD_MAP);
  target.transact(() => {
    targetBoard.clear();
    targetBoard.set("version", TODO_BOARD_VERSION);
    const targetTasks = new Y.Map<unknown>();
    targetBoard.set(TODO_TASKS_KEY, targetTasks);
    for (const item of tasks) {
      const task = new Y.Map<unknown>();
      task.set("title", item.title);
      task.set("description", item.description);
      task.set("column", item.column);
      task.set("priority", item.priority);
      task.set("deadline", item.deadline);
      task.set("blockedBy", item.blockedBy);
      task.set("assigneeIds", item.assigneeIds);
      task.set("createdAt", item.createdAt);
      task.set("updatedAt", item.updatedAt);
      targetTasks.set(item.id, task);
    }
  }, "copy-todo-board");
}

function ensureTaskMap(document: Y.Doc): Y.Map<unknown> {
  const board = document.getMap<unknown>(TODO_BOARD_MAP);
  const existing = board.get(TODO_TASKS_KEY);
  if (existing instanceof Y.Map) return existing as Y.Map<unknown>;
  const tasks = new Y.Map<unknown>();
  document.transact(() => {
    if (!board.has("version")) board.set("version", TODO_BOARD_VERSION);
    board.set(TODO_TASKS_KEY, tasks);
  }, "repair-todo-board");
  return tasks;
}

function readTaskMap(document: Y.Doc): Y.Map<unknown> | null {
  const value = document.getMap<unknown>(TODO_BOARD_MAP).get(TODO_TASKS_KEY);
  return value instanceof Y.Map ? value as Y.Map<unknown> : null;
}

function toTodoTask(id: string, value: unknown, knownTaskIds: ReadonlySet<string>): TodoTask | null {
  if (!(value instanceof Y.Map)) return null;
  const title = normalizeTitle(value.get("title"));
  if (!title) return null;
  const column = value.get("column");
  const priority = value.get("priority");
  const deadline = normalizeDeadline(value.get("deadline"));
  return {
    id,
    title,
    description: normalizeDescription(value.get("description")),
    column: isTodoColumn(column) ? column : "NEW",
    priority: isTodoPriority(priority) ? priority : "MEDIUM",
    deadline,
    blockedBy: normalizeTodoDependencies(value.get("blockedBy"), knownTaskIds, id),
    assigneeIds: normalizeTodoAssignees(value.get("assigneeIds")),
    createdAt: safeTime(value.get("createdAt")),
    updatedAt: safeTime(value.get("updatedAt")),
  };
}

function normalizeTitle(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 240) : "";
}

export function normalizeTodoAssignees(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200))].sort();
}

export class TodoBoardDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TodoBoardDecodeError";
  }
}

/** Indexing must never silently discard unreadable task records. */
export function readTodoTasksForIndex(document: Y.Doc) {
  const board = document.getMap<unknown>(TODO_BOARD_MAP);
  if (!board.size) return [];
  if (board.get("version") !== TODO_BOARD_VERSION) throw new TodoBoardDecodeError("Unsupported Todo board version.");
  const tasks = board.get(TODO_TASKS_KEY);
  if (!(tasks instanceof Y.Map)) throw new TodoBoardDecodeError("Todo tasks are not a Y.Map.");
  for (const [id, value] of tasks.entries()) {
    if (!(value instanceof Y.Map) || !normalizeTitle(value.get("title"))) {
      throw new TodoBoardDecodeError(`Unreadable Todo task ${id}.`);
    }
    if (!isTodoColumn(value.get("column")) || !isTodoPriority(value.get("priority"))) {
      throw new TodoBoardDecodeError(`Invalid Todo status or priority for ${id}.`);
    }
    const deadline = value.get("deadline");
    if (deadline !== null && deadline !== undefined && normalizeDeadline(deadline) !== deadline) {
      throw new TodoBoardDecodeError(`Invalid Todo date for ${id}.`);
    }
    const assignees = value.get("assigneeIds");
    if (assignees !== undefined && (!Array.isArray(assignees) || assignees.some((item) => typeof item !== "string" || !item || item.length > 200))) {
      throw new TodoBoardDecodeError(`Invalid Todo assignees for ${id}.`);
    }
    const dependencies = value.get("blockedBy");
    if (dependencies !== undefined && (!Array.isArray(dependencies) || dependencies.some((item) => typeof item !== "string"))) {
      throw new TodoBoardDecodeError(`Invalid Todo dependencies for ${id}.`);
    }
    for (const key of ["createdAt", "updatedAt"]) {
      const time = value.get(key);
      if (time !== undefined && (typeof time !== "number" || !Number.isSafeInteger(time) || time < 0)) {
        throw new TodoBoardDecodeError(`Invalid Todo timestamp for ${id}.`);
      }
    }
    const description = value.get("description");
    if (description !== undefined && typeof description !== "string") throw new TodoBoardDecodeError(`Invalid Todo description for ${id}.`);
  }
  return readTodoTasks(document);
}

export function decodeTodoTasks(data: Uint8Array | null | undefined) {
  const document = new Y.Doc();
  try {
    if (data?.byteLength) Y.applyUpdate(document, data);
    return readTodoTasksForIndex(document);
  } catch (error) {
    if (error instanceof TodoBoardDecodeError) throw error;
    throw new TodoBoardDecodeError("The Todo board Yjs data cannot be decoded.");
  } finally {
    document.destroy();
  }
}

/** Merge durable snapshots so a late store from another Collab process cannot undo newer changes. */
export function mergeTodoBoardStates(current: Uint8Array | null | undefined, incoming: Uint8Array) {
  const document = new Y.Doc();
  try {
    if (current?.byteLength) Y.applyUpdate(document, current);
    const previous = readTodoTasksForIndex(document);
    Y.applyUpdate(document, incoming);
    validateTodoTaskChanges(previous, readTodoTasksForIndex(document));
    return Y.encodeStateAsUpdate(document);
  } catch (error) {
    if (error instanceof TodoBoardDecodeError) throw error;
    throw new TodoBoardDecodeError("The Todo board Yjs data cannot be merged.");
  } finally {
    document.destroy();
  }
}

/** Apply completion/dependency rules to the merged result, including concurrent changes. */
export function validateTodoTaskChanges(previousTasks: readonly TodoTask[], nextTasks: readonly TodoTask[]) {
  const before = new Map(previousTasks.map((task) => [task.id, task]));
  const merged = new Map(nextTasks.map((task) => [task.id, task]));
  for (const task of nextTasks) {
    const previous = before.get(task.id);
    const changedDependencies = !previous || JSON.stringify([...task.blockedBy].sort()) !== JSON.stringify([...previous.blockedBy].sort());
    const changedCompletion = task.column === "COMPLETED" && previous?.column !== "COMPLETED";
    if ((changedCompletion || changedDependencies) && task.column === "COMPLETED"
      && task.blockedBy.some((id) => merged.get(id)?.column !== "COMPLETED")) {
      throw new TodoBoardDecodeError(`Task ${task.id} still has unfinished dependencies.`);
    }
    if (changedDependencies) {
      const reaches = (id: string, seen = new Set<string>()): boolean => {
        if (id === task.id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return merged.get(id)?.blockedBy.some((dependency) => reaches(dependency, seen)) ?? false;
      };
      if (task.blockedBy.some((dependency) => reaches(dependency))) throw new TodoBoardDecodeError(`Task ${task.id} creates a dependency cycle.`);
    }
  }
}

function normalizeTodoDependencies(value: unknown, knownTaskIds?: ReadonlySet<string>, ownId?: string) {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string" || candidate === ownId || (knownTaskIds && !knownTaskIds.has(candidate)) || result.includes(candidate)) continue;
    result.push(candidate);
  }
  return result;
}

function todoDependenciesAreCompleted(tasks: Y.Map<unknown>, blockedBy: readonly string[]) {
  return blockedBy.every((dependencyId) => {
    const dependency = tasks.get(dependencyId);
    return dependency instanceof Y.Map && dependency.get("column") === "COMPLETED";
  });
}

function todoTaskDependsOn(tasks: ReadonlyMap<string, TodoTask>, id: string, targetId: string, visited: Set<string>): boolean {
  if (id === targetId) return true;
  if (visited.has(id)) return false;
  visited.add(id);
  return tasks.get(id)?.blockedBy.some((dependencyId) => todoTaskDependsOn(tasks, dependencyId, targetId, visited)) ?? false;
}

function normalizeDescription(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 12000) : "";
}

function normalizeDeadline(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function isTodoColumn(value: unknown): value is TodoColumn {
  return typeof value === "string" && (TODO_COLUMNS as readonly string[]).includes(value);
}

function isTodoPriority(value: unknown): value is TodoPriority {
  return typeof value === "string" && (TODO_PRIORITIES as readonly string[]).includes(value);
}

function priorityRank(priority: TodoPriority) {
  return TODO_PRIORITIES.length - TODO_PRIORITIES.indexOf(priority);
}

function deadlineRank(deadline: string | null) {
  return deadline ? Number(deadline.replaceAll("-", "")) : Number.MAX_SAFE_INTEGER;
}

function safeTime(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function localDateKey(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
