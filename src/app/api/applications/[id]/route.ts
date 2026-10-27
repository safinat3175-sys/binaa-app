import { db } from "@/db";
import { applications, projects, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import {
  buildContractorMatchMessage,
  buildWorkerMatchMessage,
  logNotification,
  sendTelegramMessage,
} from "@/lib/telegram";
import { specialtyLabel } from "@/lib/specialties";
import { wilayaLabel } from "@/lib/wilayas";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// ADMIN — approve / reject. On approve, Telegram notifications fire to BOTH parties.
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireAdmin(req);
  if (!auth) return Response.json({ error: "Unauthorized — admin only" }, { status: 401 });

  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = String(body.action ?? "").toLowerCase();
  if (!["approve", "reject"].includes(action))
    return Response.json({ error: "action must be approve|reject" }, { status: 400 });

  const app = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
  if (!app[0]) return Response.json({ error: "Application not found" }, { status: 404 });

  const nextStatus = action === "approve" ? "approved" : "rejected";
  await db
    .update(applications)
    .set({ status: nextStatus, decidedAt: new Date(), decidedBy: auth.user.id })
    .where(eq(applications.id, id));

  const notifications: Array<{ to: string; role: string; status: string; error?: string }> = [];

  if (action === "approve") {
    const [projRows, workerRows] = await Promise.all([
      db.select().from(projects).where(eq(projects.id, app[0].projectId)).limit(1),
      db.select().from(users).where(eq(users.id, app[0].workerId)).limit(1),
    ]);
    const proj = projRows[0];
    const worker = workerRows[0];
    const contractorRows = proj
      ? await db.select().from(users).where(eq(users.id, proj.contractorId)).limit(1)
      : [];
    const contractor = contractorRows[0];

    if (proj && worker && contractor) {
      const wilayaName = wilayaLabel(proj.wilaya);
      const specName = specialtyLabel(worker.specialty ?? proj.specialty);

      // 1) Notify the WORKER — includes contractor phone
      const workerMsg = buildWorkerMatchMessage({
        workerName: worker.name,
        contractorName: contractor.name,
        contractorPhone: contractor.phone,
        projectTitle: proj.title,
        wilaya: wilayaName,
        dailyWage: proj.dailyWage,
      });
      if (worker.telegramId) {
        const r = await sendTelegramMessage(worker.telegramId, workerMsg);
        await logNotification({
          applicationId: id,
          recipientRole: "worker",
          recipientTelegramId: worker.telegramId,
          message: workerMsg,
          status: r.ok ? (r.simulated ? "simulated" : "sent") : "failed",
          telegramMessageId: r.messageId ?? null,
          error: r.error ?? null,
        });
        notifications.push({
          to: worker.telegramId,
          role: "worker",
          status: r.ok ? (r.simulated ? "simulated (no BOT_TOKEN)" : "sent") : "failed",
          error: r.error,
        });
      } else {
        await logNotification({
          applicationId: id,
          recipientRole: "worker",
          recipientTelegramId: "—",
          message: workerMsg,
          status: "failed",
          error: "Worker has no Telegram ID registered",
        });
        notifications.push({ to: "—", role: "worker", status: "skipped: no Telegram ID" });
      }

      // 2) Notify the CONTRACTOR — includes worker phone
      const contractorMsg = buildContractorMatchMessage({
        contractorName: contractor.name,
        workerName: worker.name,
        workerPhone: worker.phone,
        workerSpecialty: specName,
        projectTitle: proj.title,
      });
      if (contractor.telegramId) {
        const r = await sendTelegramMessage(contractor.telegramId, contractorMsg);
        await logNotification({
          applicationId: id,
          recipientRole: "contractor",
          recipientTelegramId: contractor.telegramId,
          message: contractorMsg,
          status: r.ok ? (r.simulated ? "simulated" : "sent") : "failed",
          telegramMessageId: r.messageId ?? null,
          error: r.error ?? null,
        });
        notifications.push({
          to: contractor.telegramId,
          role: "contractor",
          status: r.ok ? (r.simulated ? "simulated (no BOT_TOKEN)" : "sent") : "failed",
          error: r.error,
        });
      } else {
        await logNotification({
          applicationId: id,
          recipientRole: "contractor",
          recipientTelegramId: "—",
          message: contractorMsg,
          status: "failed",
          error: "Contractor has no Telegram ID registered",
        });
        notifications.push({ to: "—", role: "contractor", status: "skipped: no Telegram ID" });
      }

      // Auto-close project if enough workers approved
      const approvedCount = await db
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.projectId, proj.id));
      // count approved
      const approvedRows = await db
        .select()
        .from(applications)
        .where(eq(applications.projectId, proj.id));
      const nApproved = approvedRows.filter((a) => a.status === "approved").length;
      if (nApproved >= proj.workersNeeded && proj.status === "open") {
        await db.update(projects).set({ status: "matched" }).where(eq(projects.id, proj.id));
      }
      void approvedCount;
    }
  }

  return Response.json({ ok: true, status: nextStatus, notifications });
}
