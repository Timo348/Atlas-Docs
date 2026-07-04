import { NextResponse } from "next/server";
import { z } from "zod";
import { canEdit, pageAccess, requireApiUser } from "@/lib/access";
import { db } from "@/lib/db";

const MAX_SNAPSHOT_BYTES = 25 * 1024 * 1024;
const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  snapshot: z.string().min(1),
  restoredFromVersion: z.number().int().positive().optional(),
});

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await context.params;
  const page = await pageAccess(user.id, id);
  if (!page) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  const versions = await db.pageVersion.findMany({
    where: { pageId: id },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      title: true,
      restoredFromVersion: true,
      createdAt: true,
      createdBy: { select: { name: true, email: true } },
    },
  });
  return NextResponse.json(versions.map(({ createdBy, ...version }) => ({
    ...version,
    author: createdBy.name || createdBy.email,
  })));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await context.params;
  const page = await pageAccess(user.id, id);
  if (!page || !canEdit(page.accessRole)) {
    return NextResponse.json({ error: "Kein Schreibzugriff" }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Version" }, { status: 400 });

  const data = decodeSnapshot(parsed.data.snapshot);
  if (!data || data.byteLength > MAX_SNAPSHOT_BYTES) {
    return NextResponse.json({ error: "Der Versionsstand ist ungültig oder größer als 25 MB" }, { status: 400 });
  }
  const version = await db.$transaction(async (transaction) => {
    const updatedPage = await transaction.page.update({
      where: { id },
      data: { versionCounter: { increment: 1 } },
      select: { versionCounter: true },
    });
    return transaction.pageVersion.create({
      data: {
        pageId: id,
        version: updatedPage.versionCounter,
        title: parsed.data.title,
        data: Buffer.from(data),
        restoredFromVersion: parsed.data.restoredFromVersion,
        createdById: user.id,
      },
      select: {
        id: true,
        version: true,
        title: true,
        restoredFromVersion: true,
        createdAt: true,
      },
    });
  });
  return NextResponse.json({ ...version, author: user.name || user.email }, { status: 201 });
}

function decodeSnapshot(value: string) {
  try {
    const data = Buffer.from(value, "base64");
    if (!data.length) return null;
    const normalized = value.replace(/\s/g, "").replace(/=+$/, "");
    if (data.toString("base64").replace(/=+$/, "") !== normalized) return null;
    return new Uint8Array(data);
  } catch {
    return null;
  }
}
