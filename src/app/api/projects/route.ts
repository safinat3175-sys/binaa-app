import { db } from "@/db";
import { applications, projects, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getUserFromRequest, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PUBLIC — masked list. Contractor phone/telegram NEVER exposed.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const specialty = url.searchParams.get("specialty");
  const wilaya = url.searchParams.get("wilaya");

  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      description: projects.description,
      wilaya: projects.wilaya,
      commune: projects.commune,
      specialty: projects.specialty,
      workersNeeded: projects.workersNeeded,
      dailyWage: projects.dailyWage,
      durationDays: projects.durationDays,
      status: projects.status,
      createdAt: projects.createdAt,
      contractorId: projects.contractorId,
      contractorName: users.name,
      contractorWilaya: users.wilaya,
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.contractorId))
    .orderBy(desc(projects.createdAt))
    .limit(200);

  const counts = await db
    .select({ projectId: applications.projectId })
    .from(applications);

  const countByProject = new Map<string, number>();
  for (const c of counts) {
    countByProject.set(c.projectId, (countByProject.get(c.projectId) ?? 0) + 1);
  }

  let out = rows.map((r) => {
    const cname = r.contractorName ?? "مقاول";
    const parts = cname.trim().split(/\s+/);
    const maskedContractor =
      parts.length > 1
        ? `${parts[0]} ${parts.slice(1).map((x) => x[0]?.toUpperCase() + ".").join(" ")}`
        : cname;
    return {
      ...r,
      contractorName: maskedContractor,
      applicationsCount: countByProject.get(r.id) ?? 0,
      contactProtected: true,
    };
  });

  if (specialty) out = out.filter((r) => r.specialty === specialty);
  if (wilaya) out = out.filter((r) => r.wilaya === wilaya);

  return Response.json({ projects: out });
}

// AUTHENTICATED — only an OTP-verified contractor can post, as themselves.
export async function POST(req: Request) {
  const me = await getUserFromRequest(req);
  if (!me || me.role !== "contractor")
    return Response.json({ error: "سجّل الدخول كمقاول أولاً" }, { status: 401 });
  if (!me.profileCompleted) return Response.json({ error: "أكمل ملفك الشخصي أولاً" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const wilaya = String(body.wilaya ?? "").trim();
  const commune = String(body.commune ?? "").trim();
  const specialty = String(body.specialty ?? "").trim();
  const workersNeeded = Math.max(1, Math.min(500, Number(body.workersNeeded ?? 1) || 1));
  const dailyWage = Number(body.dailyWage ?? 0) || 0;
  const durationDays = body.durationDays ? Number(body.durationDays) : null;

  if (!title) return Response.json({ error: "عنوان المشروع مطلوب" }, { status: 400 });
  if (!wilaya) return Response.json({ error: "الولاية مطلوبة" }, { status: 400 });
  if (!specialty) return Response.json({ error: "التخصص مطلوب" }, { status: 400 });
  if (dailyWage < 500)
    return Response.json({ error: "الأجر اليومي يجب أن يكون 500 دج على الأقل" }, { status: 400 });

  const contractorId = me.id;

  const proj = await db
    .insert(projects)
    .values({
      contractorId,
      title,
      description: description || null,
      wilaya,
      commune: commune || null,
      specialty,
      workersNeeded,
      dailyWage,
      durationDays,
      status: "open",
    })
    .returning({ id: projects.id });

  return Response.json({ ok: true, projectId: proj[0].id }, { status: 201 });
}

// ADMIN — close / delete a project
export async function DELETE(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  await db.delete(projects).where(eq(projects.id, id));
  return Response.json({ ok: true });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  const status = String(body.status ?? "");
  if (!id || !["open", "matched", "closed"].includes(status))
    return Response.json({ error: "Invalid id/status" }, { status: 400 });
  const { projects: projTable } = await import("@/db/schema");
  const { eq: eq2 } = await import("drizzle-orm");
  await db.update(projTable).set({ status }).where(eq2(projTable.id, id));
  return Response.json({ ok: true });
}
