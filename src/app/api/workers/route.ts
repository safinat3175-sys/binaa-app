import { db } from "@/db";
import { users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// PUBLIC — masked list. Phone & Telegram IDs are NEVER exposed here.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const specialty = url.searchParams.get("specialty");
  const wilaya = url.searchParams.get("wilaya");
  const q = url.searchParams.get("q");

  let rows = await db
    .select({
      id: users.id,
      name: users.name,
      specialty: users.specialty,
      wilaya: users.wilaya,
      experienceYears: users.experienceYears,
      dailyWageExpectation: users.dailyWageExpectation,
      isAvailable: users.isAvailable,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.role, "worker"))
    .orderBy(desc(users.createdAt))
    .limit(200);

  if (specialty) rows = rows.filter((r) => r.specialty === specialty);
  if (wilaya) rows = rows.filter((r) => r.wilaya === wilaya);
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => (r.name ?? "").toLowerCase().includes(needle));
  }

  // Mask names for privacy: "Ahmed B." style
  const masked = rows.map((r) => {
    const parts = (r.name || "").trim().split(/\s+/);
    const display =
      parts.length > 1
        ? `${parts[0]} ${parts.slice(1).map((x) => x[0]?.toUpperCase() + ".").join(" ")}`
        : r.name;
    return { ...r, name: display, contactProtected: true };
  });

  return Response.json({ workers: masked });
}

// Registration is handled exclusively by the Telegram OTP flow:
// POST /api/auth/request-otp → bot → POST /api/auth/verify-otp → POST /api/profile
export async function POST() {
  return Response.json(
    { error: "التسجيل يتم عبر رمز تيليغرام فقط — استخدم /api/auth/request-otp" },
    { status: 405 },
  );
}
