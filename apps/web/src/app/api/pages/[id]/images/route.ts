import { NextResponse } from "next/server";
import { canEdit, pageAccess, requireApiUser } from "@/lib/access";
import { db } from "@/lib/db";
import { readValidatedImage } from "@/lib/image-upload";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id: pageId } = await context.params;
  const page = await pageAccess(user.id, pageId);
  if (!page || !canEdit(page.accessRole)) {
    return NextResponse.json({ error: "No write access" }, { status: page ? 403 : 404 });
  }

  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return NextResponse.json({ error: "Image is missing" }, { status: 400 });
    const image = await readValidatedImage(file);
    const stored = await db.pageImage.create({
      data: {
        pageId,
        createdById: user.id,
        mime: image.mime,
        size: image.bytes.byteLength,
        data: Buffer.from(image.bytes),
      },
      select: { id: true, mime: true, size: true },
    });
    return NextResponse.json({
      ...stored,
      url: `/api/pages/${pageId}/images/${stored.id}`,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Image could not be uploaded",
    }, { status: 400 });
  }
}
