import { db } from "@/db";
import { applications, projects, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Session-scoped "my data" (replaces the old ?phone= lookup, which let
 * anyone who knew a phone number read that person's matches).
 *
 * worker     → own applications; contractor phone ONLY when approved.
 * contractor → own projects; applicant phones ONLY when approved.
 */
export async function GET(req: Request) {
  const me = await getUserFromRequest(req);
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (me.role === "worker") {
    const rows = await db
      .select({
        id: applications.id,
        status: applications.status,
        createdAt: applications.createdAt,
        projectId: applications.projectId,
        projectTitle: projects.title,
        projectWilaya: projects.wilaya,
        projectSpecialty: projects.specialty,
        dailyWage: projects.dailyWage,
        contractorId: projects.contractorId,
      })
      .from(applications)
      .leftJoin(projects, eq(projects.id, applications.projectId))
      .where(eq(applications.workerId, me.id))
      .orderBy(desc(applications.createdAt))
      .limit(100);

    const out = [];
    for (const r of rows) {
      let contractorPhone: string | null = null;
      let contractorName: string | null = null;
      if (r.status === "approved" && r.contractorId) {
        const c = (await db.select().from(users).where(eq(users.id, r.contractorId)).limit(1))[0];
        if (c) {
          contractorPhone = c.phone;
          contractorName = c.companyName ?? c.name;
        }
      }
      const { contractorId: _omit, ...rest } = r;
      void _omit;
      out.push({ ...rest, contractorPhone, contractorName });
    }
    return Response.json({ applications: out });
  }

  if (me.role === "contractor") {
    const own = await db
      .select()
      .from(projects)
      .where(eq(projects.contractorId, me.id))
      .orderBy(desc(projects.createdAt))
      .limit(100);

    const out = [];
    for (const p of own) {
      const apps = await db
        .select({
          id: applications.id,
          status: applications.status,
          createdAt: applications.createdAt,
          workerName: users.name,
          workerSpecialty: users.specialty,
          workerPhone: users.phone,
          workerExperience: users.experienceYears,
        })
        .from(applications)
        .leftJoin(users, eq(users.id, applications.workerId))
        .where(eq(applications.projectId, p.id))
        .orderBy(desc(applications.createdAt))
        .limit(200);
      const enriched = apps.map((a) => ({
        ...a,
        workerPhone: a.status === "approved" ? a.workerPhone : null, // masked until approved
      }));
      out.push({ ...p, applications: enriched });
    }
    return Response.json({ projects: out });
  }

  return Response.json({ error: "Forbidden" }, { status: 403 });
}
