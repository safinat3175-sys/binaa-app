import { db } from "@/db";
import { applications, projects, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getUserFromRequest, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ADMIN — full list with joins (phones visible ONLY to admin).
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth) return Response.json({ error: "Unauthorized — admin only" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const rows = await db
    .select({
      id: applications.id,
      status: applications.status,
      message: applications.message,
      createdAt: applications.createdAt,
      decidedAt: applications.decidedAt,
      projectId: applications.projectId,
      projectTitle: projects.title,
      projectWilaya: projects.wilaya,
      projectSpecialty: projects.specialty,
      dailyWage: projects.dailyWage,
      workersNeeded: projects.workersNeeded,
      workerId: applications.workerId,
      workerName: users.name,
      workerPhone: users.phone,
      workerTelegram: users.telegramId,
      workerSpecialty: users.specialty,
      workerWilaya: users.wilaya,
      workerExperience: users.experienceYears,
    })
    .from(applications)
    .leftJoin(projects, eq(projects.id, applications.projectId))
    .leftJoin(users, eq(users.id, applications.workerId))
    .orderBy(desc(applications.createdAt))
    .limit(300);

  // Attach contractor info per project
  const contractorByProject = new Map<string, { name: string; phone: string; telegram: string | null }>();
  const projIds = [...new Set(rows.map((r) => r.projectId))];
  for (const pid of projIds) {
    if (!pid) continue;
    const p = await db
      .select({ contractorId: projects.contractorId })
      .from(projects)
      .where(eq(projects.id, pid))
      .limit(1);
    const cid = p[0]?.contractorId;
    if (!cid) continue;
    const c = await db.select().from(users).where(eq(users.id, cid)).limit(1);
    if (c[0]) {
      contractorByProject.set(pid, {
        name: c[0].name,
        phone: c[0].phone,
        telegram: c[0].telegramId,
      });
    }
  }

  let out = rows.map((r) => ({
    ...r,
    contractor: r.projectId ? (contractorByProject.get(r.projectId) ?? null) : null,
  }));
  if (status) out = out.filter((r) => r.status === status);

  const pending = out.filter((r) => r.status === "pending").length;
  const approved = out.filter((r) => r.status === "approved").length;
  const rejected = out.filter((r) => r.status === "rejected").length;

  return Response.json({ applications: out, counts: { pending, approved, rejected, total: out.length } });
}

// PUBLIC — worker applies to a project.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // Identity comes from the OTP-verified session — never from the body.
  const me = await getUserFromRequest(req);
  if (!me || me.role !== "worker") return Response.json({ error: "سجّل الدخول كعامل أولاً" }, { status: 401 });
  if (!me.profileCompleted) return Response.json({ error: "أكمل ملفك الشخصي أولاً" }, { status: 403 });
  const workerId = me.id;

  const projectId = String(body.projectId ?? "").trim();
  const message = String(body.message ?? "").trim().slice(0, 1000);
  if (!projectId) return Response.json({ error: "projectId مطلوب" }, { status: 400 });

  const proj = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!proj[0]) return Response.json({ error: "المشروع غير موجود" }, { status: 404 });
  if (proj[0].status === "closed")
    return Response.json({ error: "هذا المشروع مغلق" }, { status: 400 });

  const dup = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.projectId, projectId), eq(applications.workerId, workerId)))
    .limit(1);
  if (dup[0])
    return Response.json({ error: "لقد تقدمت لهذا المشروع مسبقاً — طلبك قيد المراجعة" }, { status: 409 });

  const inserted = await db
    .insert(applications)
    .values({ projectId, workerId, message: message || null, status: "pending" })
    .returning({ id: applications.id });

  return Response.json(
    { ok: true, applicationId: inserted[0].id, message: "تم إرسال طلبك! ستتوصل بإشعار تيليغرام عند القبول." },
    { status: 201 },
  );
}
