import { db } from "@/db";
import { applications, notificationLogs, projects, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ADMIN ONLY — full data including phone numbers.
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [allUsers, allProjects, allApps, logs] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)).limit(500),
    db.select().from(projects).orderBy(desc(projects.createdAt)).limit(300),
    db.select().from(applications).orderBy(desc(applications.createdAt)).limit(300),
    db.select().from(notificationLogs).orderBy(desc(notificationLogs.createdAt)).limit(100),
  ]);

  // Enrich projects with contractor + counts
  const userById = new Map(allUsers.map((u) => [u.id, u]));
  const appsByProject = new Map<string, typeof allApps>();
  for (const a of allApps) {
    const arr = appsByProject.get(a.projectId) ?? [];
    arr.push(a);
    appsByProject.set(a.projectId, arr);
  }

  const enrichedProjects = allProjects.map((p) => ({
    ...p,
    contractor: userById.get(p.contractorId)
      ? {
          name: userById.get(p.contractorId)!.name,
          phone: userById.get(p.contractorId)!.phone,
          telegramId: userById.get(p.contractorId)!.telegramId,
        }
      : null,
    applicationsCount: (appsByProject.get(p.id) ?? []).length,
    approvedCount: (appsByProject.get(p.id) ?? []).filter((a) => a.status === "approved").length,
  }));

  const enrichedApps = allApps.map((a) => {
    const worker = userById.get(a.workerId);
    const proj = allProjects.find((p) => p.id === a.projectId);
    const contractor = proj ? userById.get(proj.contractorId) : undefined;
    return {
      ...a,
      worker: worker
        ? {
            name: worker.name,
            phone: worker.phone,
            telegramId: worker.telegramId,
            specialty: worker.specialty,
            wilaya: worker.wilaya,
            experienceYears: worker.experienceYears,
          }
        : null,
      project: proj
        ? { title: proj.title, wilaya: proj.wilaya, specialty: proj.specialty, dailyWage: proj.dailyWage }
        : null,
      contractor: contractor
        ? { name: contractor.name, phone: contractor.phone, telegramId: contractor.telegramId }
        : null,
    };
  });

  // Strip secrets (password hashes, OTP hashes, link tokens) even for admins.
  const safeUsers = allUsers.map((u) => {
    const { passwordHash, otpCode, telegramLinkToken, ...rest } = u;
    void passwordHash;
    void otpCode;
    void telegramLinkToken;
    return rest;
  });

  return Response.json({
    users: safeUsers,
    projects: enrichedProjects,
    applications: enrichedApps,
    notifications: logs,
    counts: {
      workers: allUsers.filter((u) => u.role === "worker").length,
      contractors: allUsers.filter((u) => u.role === "contractor").length,
      projects: allProjects.length,
      pending: allApps.filter((a) => a.status === "pending").length,
      approved: allApps.filter((a) => a.status === "approved").length,
    },
  });
}

// ADMIN — delete a user (and cascade)
export async function DELETE(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  if (id === auth.user.id) return Response.json({ error: "Cannot delete yourself" }, { status: 400 });
  await db.delete(users).where(eq(users.id, id));
  return Response.json({ ok: true });
}
