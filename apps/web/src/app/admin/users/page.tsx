import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { db } from "@/lib/db";
import { UsersAdmin } from "@/components/users-admin";

export default async function UsersPage() {
  const current = await requireUser();
  if (current.role !== "ADMIN") redirect("/");
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      accounts: { select: { provider: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return (
    <main className="admin-page">
      <header className="admin-header">
        <div><p className="eyebrow dark"><ShieldCheck size={15} /> Administration</p><h1>Benutzerverwaltung</h1></div>
        <Link href="/" className="button secondary-button"><ArrowLeft size={16} /> Zurück zum Workspace</Link>
      </header>
      <UsersAdmin
        initialUsers={users.map((user) => ({ ...user, createdAt: user.createdAt.toISOString() }))}
        currentUserId={current.id}
      />
    </main>
  );
}
