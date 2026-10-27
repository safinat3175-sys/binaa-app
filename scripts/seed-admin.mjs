#!/usr/bin/env node
/**
 * Creates or updates the platform admin in the target database.
 *
 * Usage (after `npx drizzle-kit push` has created the tables):
 *   DATABASE_URL="postgres://..." ADMIN_PHONE=0663471513 ADMIN_PASSWORD='StrongPass!' node scripts/seed-admin.mjs
 *
 * Reads .env automatically if present.
 */
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL;
const phoneRaw = process.env.ADMIN_PHONE ?? "0663471513";
const password = process.env.ADMIN_PASSWORD ?? "admin123";
const name = process.env.ADMIN_NAME ?? "مدير بناء";

if (!url) {
  console.error("❌ DATABASE_URL is required");
  process.exit(1);
}

let d = phoneRaw.replace(/\D/g, "");
if (d.startsWith("00213")) d = d.slice(5);
else if (d.startsWith("213")) d = d.slice(3);
if (d.length === 9 && /^[567]/.test(d)) d = "0" + d;
if (!/^0[567]\d{8}$/.test(d)) {
  console.error("❌ ADMIN_PHONE must be an Algerian mobile (05/06/07 + 8 digits)");
  process.exit(1);
}
if (password.length < 8) {
  console.error("❌ ADMIN_PASSWORD must be at least 8 characters");
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(url);
const client = new pg.Client({ connectionString: url, ssl: isLocal ? undefined : { rejectUnauthorized: false } });

try {
  await client.connect();
  const hash = await bcrypt.hash(password, 10);
  const existing = await client.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (existing.rows[0]) {
    await client.query(
      `UPDATE users SET phone = $1, password_hash = $2, name = $3, username = 'admin',
         is_verified = true, profile_completed = true, agreement_accepted = true
       WHERE id = $4`,
      [d, hash, name, existing.rows[0].id],
    );
    console.log(`✅ Admin updated → phone ${d}`);
  } else {
    await client.query(
      `INSERT INTO users (name, phone, role, username, password_hash, is_verified, profile_completed, agreement_accepted, wilaya)
       VALUES ($1, $2, 'admin', 'admin', $3, true, true, true, '16')`,
      [name, d, hash],
    );
    console.log(`✅ Admin created → phone ${d}`);
  }
  console.log("   Login at /admin with this phone number and the password you provided.");
} catch (e) {
  console.error("❌", e.message);
  process.exit(1);
} finally {
  await client.end();
}
