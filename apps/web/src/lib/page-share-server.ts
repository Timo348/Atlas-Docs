import "server-only";

import { db } from "@/lib/db";
import { pageShareIsActive, pageShareTokenHash, validPageShareToken } from "@/lib/page-share";

export async function activePageShare(token: string, now = new Date()) {
  if (!validPageShareToken(token)) return null;
  const share = await db.pageShare.findUnique({
    where: { tokenHash: pageShareTokenHash(token) },
    include: {
      page: {
        select: {
          id: true,
          title: true,
          slug: true,
          format: true,
          createdById: true,
          createdBy: { select: { language: true } },
        },
      },
    },
  });
  return share && pageShareIsActive(share, now) ? share : null;
}
