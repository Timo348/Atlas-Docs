import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { db } from "@/lib/db";
import { WorkspaceShell } from "@/components/workspace-shell";

export default async function Home(props: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const { page: requestedPage } = await props.searchParams;
  const spaces = await db.space.findMany({
    where: { memberships: { some: { userId: user.id } } },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      memberships: { where: { userId: user.id }, select: { role: true } },
      pages: {
        select: { id: true, title: true, parentId: true, slug: true },
        orderBy: [{ parentId: "asc" }, { title: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });
  const pages = spaces.flatMap((space) => space.pages);
  const selected = pages.find((page) => page.id === requestedPage) || pages[0] || null;
  if (requestedPage && !selected) redirect("/");

  return (
    <WorkspaceShell
      spaces={spaces}
      selectedPage={selected}
      user={{ id: user.id, name: user.name || user.email, email: user.email, role: user.role }}
    />
  );
}
