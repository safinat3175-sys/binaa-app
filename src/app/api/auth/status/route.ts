import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Polled by the UI while "waiting for Telegram".
 * Looks up by the opaque requestId (deep-link token) — no phone in the URL.
 * Returns only booleans; never any personal data.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("requestId") ?? "";
  if (!/^[a-f0-9]{40}$/.test(id)) return Response.json({ error: "bad requestId" }, { status: 400 });

  const u = (await db.select().from(users).where(eq(users.telegramLinkToken, id)).limit(1))[0];
  if (!u) return Response.json({ valid: false, linked: false, delivered: false, verified: false });

  return Response.json({
    valid: !!u.telegramLinkExpiry && u.telegramLinkExpiry.getTime() > Date.now(),
    linked: !!u.telegramId,
    delivered: !!u.otpDeliveredAt && !!u.otpSentAt && u.otpDeliveredAt >= u.otpSentAt,
    otpExpiresAt: u.otpExpiry,
  });
}
