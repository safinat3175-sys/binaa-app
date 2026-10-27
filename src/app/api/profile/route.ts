import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromRequest, publicSelf } from "@/lib/auth";
import { SPECIALTIES } from "@/lib/specialties";
import { WILAYAS } from "@/lib/wilayas";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ user: publicSelf(user) });
}

/**
 * "Complete Your Profile" → "Submit Application".
 * Worker:     specialty, dailyWageExpectation, wilaya, experienceYears?, agreement
 * Contractor: companyName, wilaya, businessDetails?, agreement
 */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const agreement = body.agreement === true || body.agreementAccepted === true;
  if (!agreement) return Response.json({ error: "يجب الموافقة على الشروط والأحكام" }, { status: 400 });

  const wilaya = String(body.wilaya ?? "").trim();
  if (!WILAYAS.some((w) => w.code === wilaya)) return Response.json({ error: "اختر الولاية" }, { status: 400 });

  const patch: Partial<typeof users.$inferInsert> = {
    wilaya,
    agreementAccepted: true,
    agreementAcceptedAt: new Date(),
    profileCompleted: true,
  };

  if (user.role === "worker") {
    const specialty = String(body.specialty ?? "").trim();
    if (!SPECIALTIES.some((s) => s.value === specialty))
      return Response.json({ error: "اختر التخصص" }, { status: 400 });
    const wage = Number(body.dailyWageExpectation ?? 0);
    if (!Number.isFinite(wage) || wage < 500 || wage > 100000)
      return Response.json({ error: "أدخل أجراً يومياً صحيحاً (500 دج على الأقل)" }, { status: 400 });
    patch.specialty = specialty;
    patch.dailyWageExpectation = Math.round(wage);
    patch.experienceYears = Math.max(0, Math.min(60, Number(body.experienceYears ?? 0) || 0));
  } else if (user.role === "contractor") {
    const companyName = String(body.companyName ?? "").trim().slice(0, 200);
    if (companyName.length < 2) return Response.json({ error: "اسم الشركة / المقاول مطلوب" }, { status: 400 });
    patch.companyName = companyName;
    patch.businessDetails = String(body.businessDetails ?? "").trim().slice(0, 1000) || null;
  } else {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = String(body.name ?? "").trim();
  if (name.length >= 2) patch.name = name.slice(0, 120);

  const updated = (await db.update(users).set(patch).where(eq(users.id, user.id)).returning())[0];
  return Response.json({ ok: true, user: publicSelf(updated) });
}
