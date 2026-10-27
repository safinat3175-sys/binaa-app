import { db } from "@/db";
import { applications, projects, users } from "@/db/schema";
import { count, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const [[w], [c], [p], [a], [m]] = await Promise.all([
    db.select({ v: count() }).from(users).where(eq(users.role, "worker")),
    db.select({ v: count() }).from(users).where(eq(users.role, "contractor")),
    db.select({ v: count() }).from(projects),
    db.select({ v: count() }).from(applications).where(eq(applications.status, "pending")),
    db.select({ v: count() }).from(applications).where(eq(applications.status, "approved")),
  ]);
  return Response.json({
    workers: w.v,
    contractors: c.v,
    projects: p.v,
    pendingApplications: a.v,
    matches: m.v,
  });
}
