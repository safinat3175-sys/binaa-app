import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { eq } from "drizzle-orm";

export const ADMIN_COOKIE = "jisr_admin_session";
export const USER_COOKIE = "binaa_session";
const ADMIN_TTL_S = 60 * 60 * 24 * 7; // 7 days
const USER_TTL_S = 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/* ── Generic session helpers ───────────────────────────────────── */

async function createSession(userId: string, cookieName: string, ttlSeconds: number) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await db.insert(sessions).values({ userId, token, expiresAt });
  const jar = await cookies();
  jar.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttlSeconds,
  });
  return token;
}

async function destroySession(cookieName: string) {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  jar.set(cookieName, "", { path: "/", maxAge: 0 });
}

async function resolveSession(token: string | null | undefined): Promise<User | null> {
  if (!token) return null;
  const rows = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  const session = rows[0];
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.token, token));
    return null;
  }
  const u = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return u[0] ?? null;
}

export function getCookieFromRequest(req: Request, name: string): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  for (const p of cookie.split(";").map((s) => s.trim())) {
    if (p.startsWith(`${name}=`)) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

/* ── Admin (username/password) ─────────────────────────────────── */

export async function createAdminSession(userId: string) {
  return createSession(userId, ADMIN_COOKIE, ADMIN_TTL_S);
}
export async function destroyAdminSession() {
  return destroySession(ADMIN_COOKIE);
}
export async function getAdminFromToken(token: string | undefined | null) {
  const user = await resolveSession(token);
  if (!user || user.role !== "admin") return null;
  return { user };
}
export function getTokenFromRequest(req: Request): string | null {
  return getCookieFromRequest(req, ADMIN_COOKIE);
}
export async function requireAdmin(req: Request) {
  return getAdminFromToken(getTokenFromRequest(req));
}

/* ── End-user (Telegram OTP) ───────────────────────────────────── */

export async function createUserSession(userId: string) {
  return createSession(userId, USER_COOKIE, USER_TTL_S);
}
export async function destroyUserSession() {
  return destroySession(USER_COOKIE);
}
/** Returns the verified worker/contractor behind the request, or null. */
export async function getUserFromRequest(req: Request): Promise<User | null> {
  const user = await resolveSession(getCookieFromRequest(req, USER_COOKIE));
  if (!user || !user.isVerified || user.role === "admin") return null;
  return user;
}

/** Shape safe to return to the logged-in user about themselves. */
export function publicSelf(u: User) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    wilaya: u.wilaya,
    specialty: u.specialty,
    dailyWageExpectation: u.dailyWageExpectation,
    experienceYears: u.experienceYears,
    companyName: u.companyName,
    businessDetails: u.businessDetails,
    isVerified: u.isVerified,
    profileCompleted: u.profileCompleted,
    agreementAccepted: u.agreementAccepted,
    telegramLinked: !!u.telegramId,
  };
}
