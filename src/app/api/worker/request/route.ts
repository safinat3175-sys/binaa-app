import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * WORKER REQUEST — Part 3.
 * Saves the worker's Specialty / Wilaya / Daily Wage / Experience and publishes
 * their request into the admin's review queue.
 */
export async function POST(req: Request) {
  try {
    const payload = verifyToken(getTokenFromRequest(req.headers.get("cookie")) ?? "");
    if (!payload) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (body?.agreement_accepted !== true) {
      return NextResponse.json({ error: "agreement_required" }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // A contractor must never write to the worker form, and vice-versa.
    if (user.role !== "worker") {
      return NextResponse.json({ error: "worker_only" }, { status: 403 });
    }

    const specialty = String(body?.specialty ?? "").trim();
    const wilaya = String(body?.wilaya ?? "").trim();
    const dailyWage = Number(body?.daily_wage);
    const experience = String(body?.experience ?? "").trim();

    if (!specialty || !wilaya) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }
    if (!Number.isFinite(dailyWage) || dailyWage <= 0) {
      return NextResponse.json({ error: "invalid_wage" }, { status: 400 });
    }

    const [updated] = await db
      .update(users)
      .set({
        specialty,
        wilaya,
        daily_wage: Math.round(dailyWage),
        experience: experience || null,
        about: experience || user.about,
        agreement_accepted: true,
        profile_completed: true,
        // every new submission re-enters the admin's pending queue
        moderation_status: "pending",
      })
      .where(eq(users.id, user.id))
      .returning();

    return NextResponse.json({
      ok: true,
      published: true,
      user: {
        id: updated.id,
        name: updated.name,
        role: updated.role,
        specialty: updated.specialty,
        wilaya: updated.wilaya,
        daily_wage: updated.daily_wage,
        experience: updated.experience,
        avatar_url: updated.avatar_url,
        profile_completed: updated.profile_completed,
        moderation_status: updated.moderation_status,
      },
    });
  } catch (err) {
    console.error("worker request error", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
