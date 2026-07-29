import { NextResponse } from "next/server";
import { requireApiUser, spaceAccess } from "@/lib/access";
import { apiErrorResponse, isCodedApiError } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { readValidatedImage } from "@/lib/image-upload";

async function managementAccess(
  user: { id: string; role: string },
  spaceId: string,
): Promise<"allowed" | "forbidden" | "not-found"> {
  const space = await db.space.findUnique({ where: { id: spaceId }, select: { id: true } });
  if (!space) return "not-found";
  if (user.role === "ADMIN" || (await spaceAccess(user.id, spaceId)) === "OWNER") return "allowed";
  return "forbidden";
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const current = await requireApiUser();
  if (!current) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id } = await context.params;
  if (current.role !== "ADMIN" && !await spaceAccess(current.id, id)) {
    return apiErrorResponse("ACCESS_DENIED", 403);
  }
  const space = await db.space.findUnique({
    where: { id },
    select: { imageData: true, imageMime: true },
  });
  if (!space?.imageData || !space.imageMime) return new NextResponse(null, { status: 404 });
  return new NextResponse(space.imageData, {
    headers: {
      "Content-Type": space.imageMime,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await requireApiUser();
  if (!current) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id } = await context.params;
  try {
    const access = await managementAccess(current, id);
    if (access === "not-found") return apiErrorResponse("SPACE_NOT_FOUND", 404);
    if (access === "forbidden") return apiErrorResponse("SPACE_OWNER_OR_ADMIN_REQUIRED", 403);

    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return apiErrorResponse("IMAGE_MISSING", 400);
    const image = await readValidatedImage(file);
    const updated = await db.space.updateMany({
      where: { id },
      data: { imageData: Buffer.from(image.bytes), imageMime: image.mime },
    });
    if (!updated.count) return apiErrorResponse("SPACE_NOT_FOUND", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isCodedApiError(error)) return apiErrorResponse(error.code, 400);
    console.error("[atlas-api] Space image save failed.", error);
    return apiErrorResponse("IMAGE_SAVE_FAILED", 500);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const current = await requireApiUser();
  if (!current) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id } = await context.params;
  try {
    const access = await managementAccess(current, id);
    if (access === "not-found") return apiErrorResponse("SPACE_NOT_FOUND", 404);
    if (access === "forbidden") return apiErrorResponse("SPACE_OWNER_OR_ADMIN_REQUIRED", 403);

    const updated = await db.space.updateMany({
      where: { id },
      data: { imageData: null, imageMime: null },
    });
    if (!updated.count) return apiErrorResponse("SPACE_NOT_FOUND", 404);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[atlas-api] Space image removal failed.", error);
    return apiErrorResponse("IMAGE_SAVE_FAILED", 500);
  }
}
