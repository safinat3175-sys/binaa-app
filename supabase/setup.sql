-- ═══════════════════════════════════════════════════════════════════
--  Binaa | بناء — one-shot database setup for Supabase / Neon
--  Paste this WHOLE file into Supabase → SQL Editor → Run.
--  Safe to run twice (IF NOT EXISTS / ON CONFLICT).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Tables ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "phone" varchar(50) NOT NULL,
  "telegram_id" varchar(100),
  "specialty" varchar(120),
  "wilaya" varchar(120),
  "role" varchar(20) DEFAULT 'worker' NOT NULL,
  "username" varchar(100),
  "password_hash" text,
  "experience_years" integer DEFAULT 0,
  "daily_wage_expectation" integer,
  "is_available" boolean DEFAULT true,
  "otp_code" text,
  "otp_expiry" timestamp,
  "otp_attempts" integer DEFAULT 0 NOT NULL,
  "otp_sent_at" timestamp,
  "otp_delivered_at" timestamp,
  "is_verified" boolean DEFAULT false NOT NULL,
  "telegram_link_token" varchar(64),
  "telegram_link_expiry" timestamp,
  "agreement_accepted" boolean DEFAULT false NOT NULL,
  "agreement_accepted_at" timestamp,
  "profile_completed" boolean DEFAULT false NOT NULL,
  "company_name" varchar(255),
  "business_details" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "users_phone_unique" UNIQUE("phone"),
  CONSTRAINT "users_username_unique" UNIQUE("username")
);

CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contractor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "description" text,
  "wilaya" varchar(120) NOT NULL,
  "commune" varchar(120),
  "specialty" varchar(120) NOT NULL,
  "workers_needed" integer DEFAULT 1 NOT NULL,
  "daily_wage" integer NOT NULL,
  "duration_days" integer,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "worker_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "decided_at" timestamp,
  "decided_by" uuid REFERENCES "users"("id")
);

CREATE TABLE IF NOT EXISTS "notification_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "application_id" uuid REFERENCES "applications"("id") ON DELETE SET NULL,
  "recipient_role" varchar(20) NOT NULL,
  "recipient_telegram_id" varchar(100) NOT NULL,
  "message" text NOT NULL,
  "status" varchar(20) DEFAULT 'simulated' NOT NULL,
  "telegram_message_id" varchar(100),
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "sessions_token_unique" UNIQUE("token")
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS "users_telegram_id_idx"   ON "users" ("telegram_id");
CREATE INDEX IF NOT EXISTS "users_link_token_idx"    ON "users" ("telegram_link_token");
CREATE INDEX IF NOT EXISTS "applications_project_idx" ON "applications" ("project_id");
CREATE INDEX IF NOT EXISTS "applications_worker_idx"  ON "applications" ("worker_id");
CREATE INDEX IF NOT EXISTS "projects_contractor_idx"  ON "projects" ("contractor_id");
CREATE INDEX IF NOT EXISTS "sessions_user_idx"        ON "sessions" ("user_id");

-- ── 2. Admin account ──────────────────────────────────────────────
-- Login at /admin with:  phone 0663471513  ·  password  Binaa@2026
-- ⚠️ Change the password afterwards (see section 3).
INSERT INTO "users"
  ("name", "phone", "role", "username", "password_hash",
   "is_verified", "profile_completed", "agreement_accepted", "wilaya")
VALUES
  ('مدير بناء', '0663471513', 'admin', 'admin',
   '$2b$10$ENgXBLNuWPm2knikcG0tPuuXXrm6oNMKZ11O2cgxhESig/iII2mIe',
   true, true, true, '16')
ON CONFLICT ("phone") DO UPDATE
  SET role = 'admin',
      username = 'admin',
      password_hash = EXCLUDED.password_hash,
      is_verified = true, profile_completed = true, agreement_accepted = true;

-- ── 3. (Optional) change the admin password later ─────────────────
-- Supabase has pgcrypto, so you can set ANY password with bcrypt in SQL:
--
--   CREATE EXTENSION IF NOT EXISTS pgcrypto;
--   UPDATE "users"
--      SET password_hash = crypt('YourNewStrongPassword', gen_salt('bf', 10))
--    WHERE role = 'admin' AND phone = '0663471513';
--
-- To use a different admin phone, change '0663471513' in section 2 (and here).

-- ── 4. Verify ─────────────────────────────────────────────────────
SELECT name, phone, role, is_verified FROM "users" WHERE role = 'admin';
