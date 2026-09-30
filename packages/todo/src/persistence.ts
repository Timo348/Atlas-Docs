import { createHash } from "node:crypto";
import { decodeTodoTasks, type TodoTask } from "./index.js";

export type TodoIndexRow = Omit<TodoTask, "id" | "createdAt" | "updatedAt"> & {
  pageId: string;
  spaceId: string;
  taskId: string;
  createdAt: bigint;
  updatedAt: bigint;
  stateHash: string;
};

/** Kept structural so web, migration and collaboration can share one projection. */
export type TodoIndexTransaction = {
  todoTaskIndex: {
    deleteMany(args: { where: { pageId: string } }): Promise<unknown>;
    createMany(args: { data: TodoIndexRow[] }): Promise<unknown>;
  };
  page: {
    update(args: { where: { id: string }; data: { todoIndexState: "INDEXED"; todoIndexedAt: Date; todoIndexError: null } }): Promise<unknown>;
  };
};

export function todoTaskStateHash(task: TodoTask) {
  return createHash("sha256").update(JSON.stringify({
    id: task.id,
    title: task.title,
    description: task.description,
    column: task.column,
    priority: task.priority,
    deadline: task.deadline,
    blockedBy: [...task.blockedBy].sort(),
    assigneeIds: [...task.assigneeIds].sort(),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  })).digest("hex");
}

export function todoIndexRows(page: { id: string; spaceId: string }, tasks: TodoTask[]): TodoIndexRow[] {
  return tasks.map(({ id, createdAt, updatedAt, ...task }) => ({
    ...task,
    taskId: id,
    pageId: page.id,
    spaceId: page.spaceId,
    createdAt: BigInt(createdAt),
    updatedAt: BigInt(updatedAt),
    stateHash: todoTaskStateHash({ ...task, id, createdAt, updatedAt }),
  }));
}

/** Caller must lock Page FOR UPDATE before replacing both board state and index. */
export async function replaceTodoIndex(
  transaction: TodoIndexTransaction,
  page: { id: string; spaceId: string },
  data: Uint8Array | null | undefined,
) {
  // Decode fully before touching the existing index. Damaged boards remain intact.
  const rows = todoIndexRows(page, decodeTodoTasks(data));
  await transaction.todoTaskIndex.deleteMany({ where: { pageId: page.id } });
  if (rows.length) await transaction.todoTaskIndex.createMany({ data: rows });
  await transaction.page.update({
    where: { id: page.id },
    data: { todoIndexState: "INDEXED", todoIndexedAt: new Date(), todoIndexError: null },
  });
  return rows;
}
