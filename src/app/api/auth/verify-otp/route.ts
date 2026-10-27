import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createUserSession, publicSelf } from "@/lib/auth";
import { normalizeDzPhone, verifyOtp } from "@/lib/otp";

export const dynamic = "force-dynamic";

/**
 * Step 2 — "Verify".
 * Body: { phone, code }
 * On success: is_verified = true, httpOnly session cookie issued,
 * and the client is told where to go next (profile completion or dashboard).
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const phone = normalizeDzPhone(String(body.phone ?? ""));
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (!phone || code.length !== 6) return Response.json({ error: "رمز غير صالح" }, { status: 400 });

  const user = (await db.select().from(users).where(eq(users.phone, phone)).limit(1))[0];
  // Same generic error whether the phone exists or not (no enumeration).
  if (!user || user.role === "admin") return Response.json({ error: "رمز خاطئ" }, { status: 401 });

  const out = await verifyOtp(user, code);
  if (!out.ok) {
    const msg =
      out.reason === "expired"
        ? "انتهت صلاحية الرمز — اطلب رمزاً جديداً"
        : out.reason === "locked"
          ? "تم تجاوز عدد المحاولات — اطلب رمزاً جديداً"
          : out.reason === "none"
            ? "لا يوجد رمز نشط — اضغط «إرسال الرمز»"
            : `رمز خاطئ${out.attemptsLeft !== undefined ? ` (متبقي ${out.attemptsLeft})` : ""}`;
    return Response.json({ error: msg, reason: out.reason }, { status: 401 });
  }

  await createUserSession(user.id);
  const fresh = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  return Response.json({
    ok: true,
    user: publicSelf(fresh),
    next: fresh.profileCompleted ? "/" : "/complete-profile",
  });
}
