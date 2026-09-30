import { NextResponse } from "next/server";
import { decodeTodoTasks } from "@atlas/todo";
import { replaceTodoIndex } from "@atlas/todo/persistence";
import { canEdit, requireApiUser, spaceAccess } from "@/lib/access";
import { apiErrorResponse, isCodedApiError } from "@/lib/api-errors";
import { collaborationDocumentName, createTextCollaborationState } from "@/lib/collaboration-document";
import { db } from "@/lib/db";
import { loadAssignableSpaceMembers } from "@/lib/calendar-server";
import { readImportedFile } from "@/lib/file-import";
import { isGanttImportName, isMermaidImportName, isPlainTextImportName } from "@/lib/page-file";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";

type ImportedPage =
  | { format: "MARKDOWN" | "ATLASDOC" | "LATEX" | "CANVAS" | "MERMAID" | "GANTT" | "TEXT" | "TODO"; name: string; collaborationState: Uint8Array }
  | { format: "PDF"; name: string; bytes: Uint8Array }
  | { format: "FILE"; name: string; bytes: Uint8Array; mime: string };

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);

  try {
    const form = await request.formData();
    const file = form.get("file");
    const spaceId = stringField(form, "spaceId");
    const folderId = nullableStringField(form, "folderId");
    if (!(file instanceof File)) return apiErrorResponse("FILE_MISSING", 400);

    const title = (stringField(form, "title") || file.name || "file").trim();
    if (!title || title.length > 160 || !spaceId) return apiErrorResponse("INVALID_INPUT", 400);

    const role = await spaceAccess(user.id, spaceId);
    if (!canEdit(role)) return apiErrorResponse("WRITE_ACCESS_REQUIRED", 403);
    if (folderId) {
      const folder = await db.folder.findFirst({ where: { id: folderId, spaceId }, select: { id: true } });
      if (!folder) return apiErrorResponse("FOLDER_INVALID", 400);
    }

    const imported = await readImportedPage(file);
    if (imported.format === "TODO") {
      const eligible = new Set((await loadAssignableSpaceMembers(spaceId)).map((member) => member.id));
      if (decodeTodoTasks(imported.collaborationState).some((task) => task.assigneeIds.some((id) => !eligible.has(id)))) {
        return apiErrorResponse("TODO_IMPORT_ASSIGNEES_INVALID", 400);
      }
    }
    const baseSlug = slugify(title);
    const exists = await db.page.findUnique({
      where: { spaceId_slug: { spaceId, slug: baseSlug } },
      select: { id: true },
    });
    const slug = exists ? `${baseSlug}-${crypto.randomUUID().slice(0, 6)}` : baseSlug;
    const lastPage = await db.page.aggregate({ where: { spaceId, folderId }, _max: { sortOrder: true } });

    const page = await db.$transaction(async (transaction) => {
      const created = await transaction.page.create({
        data: {
          title,
          slug,
          spaceId,
          folderId,
          format: imported.format,
          sortOrder: (lastPage._max.sortOrder ?? -1) + 1,
          createdById: user.id,
          ...(imported.format === "FILE" ? {
            fileData: Buffer.from(imported.bytes),
            fileMime: imported.mime,
            fileSize: imported.bytes.byteLength,
          } : {}),
        },
      });

      if (imported.format === "PDF") {
        await transaction.pageAsset.create({
          data: {
            pageId: created.id,
            createdById: user.id,
            kind: "DOCUMENT",
            name: imported.name,
            mime: "application/pdf",
            size: imported.bytes.byteLength,
            data: Buffer.from(imported.bytes),
          },
        });
      } else if (imported.format !== "FILE") {
        await transaction.collabDocument.create({
          data: {
            name: collaborationDocumentName(created.id),
            data: Buffer.from(imported.collaborationState),
          },
        });
        if (imported.format === "TODO") await replaceTodoIndex(transaction, created, imported.collaborationState);
      }
      return created;
    });
    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    if (isCodedApiError(error)) {
      return apiErrorResponse(error.code, error.code === "FILE_TOO_LARGE" ? 413 : 400);
    }
    console.error("[atlas-api] File import failed.", error);
    return apiErrorResponse("FILE_SAVE_FAILED", 500);
  }
}

async function readImportedPage(file: File): Promise<ImportedPage> {
  try {
    const imported = await readImportedFile(file);
    return imported;
  } catch (error) {
    if (!isCodedApiError(error) || error.code !== "FILE_INVALID_TYPE") throw error;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = decodeOptionalText(file.name, bytes);
    if (text !== null) {
      const format = isGanttImportName(file.name)
        ? "GANTT"
        : isMermaidImportName(file.name)
          ? "MERMAID"
          : "TEXT";
      return {
        format,
        name: cleanFileName(file.name),
        collaborationState: createTextCollaborationState(text),
      };
    }
    return {
      format: "FILE",
      name: cleanFileName(file.name),
      bytes,
      mime: file.type || "application/octet-stream",
    };
  }
}

function decodeOptionalText(name: string, bytes: Uint8Array) {
  if (!isPlainTextImportName(name) && !isMermaidImportName(name) && !isGanttImportName(name)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return null;
  }
}

function cleanFileName(name: string) {
  const leaf = name.replace(/\\/g, "/").split("/").pop()?.trim() || "file";
  return leaf.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "file";
}

function stringField(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" && value ? value : null;
}

function nullableStringField(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" && value ? value : null;
}
