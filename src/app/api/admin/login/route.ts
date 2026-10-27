import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createAdminSession, verifyPassword } from "@/lib/auth";
import { normalizeDzPhone } from "@/lib/otp";

export const dynamic = "force-dynamic";

/**
 * Admin login — identifier may be the admin PHONE NUMBER (e.g. 0663471513)
 * or the legacy username ("admin"). Password is bcrypt-verified.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const identifier = String(body.identifier ?? body.phone ?? body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!identifier || !password) return Response.json({ error: "أدخل رقم الهاتف وكلمة السر" }, { status: 400 });

  const phone = normalizeDzPhone(identifier);
  const rows = phone
    ? await db.select().from(users).where(and(eq(users.phone, phone), eq(users.role, "admin"))).limit(1)
    : await db.select().from(users).where(and(eq(users.username, identifier.toLowerCase()), eq(users.role, "admin"))).limit(1);
  const user = rows[0];

  // Generic error → no enumeration
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: "خطأ في بيانات الدخول" }, { status: 401 });
  }

  await createAdminSession(user.id);
  return Response.json({ ok: true, admin: { id: user.id, name: user.name, phone: user.phone } });
}
