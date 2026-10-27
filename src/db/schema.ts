import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

// ── Users: workers, contractors, admins ─────────────────────────────
// SECURITY: phone + telegramId are NEVER returned by public APIs.
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  // Phone is the login identity → one account per phone.
  phone: varchar("phone", { length: 50 }).notNull().unique(),
  // Telegram chat_id — written ONLY by the webhook after Telegram itself
  // proves ownership (deep-link token or request_contact share).
  telegramId: varchar("telegram_id", { length: 100 }),
  specialty: varchar("specialty", { length: 120 }),
  wilaya: varchar("wilaya", { length: 120 }),
  role: varchar("role", { length: 20 }).notNull().default("worker"),
  username: varchar("username", { length: 100 }).unique(),
  passwordHash: text("password_hash"),
  experienceYears: integer("experience_years").default(0),
  dailyWageExpectation: integer("daily_wage_expectation"),
  isAvailable: boolean("is_available").default(true),

  // ── Telegram OTP login ───────────────────────────────────────────
  otpCode: text("otp_code"), // sha256(userId:code:pepper) — never plaintext
  otpExpiry: timestamp("otp_expiry"),
  otpAttempts: integer("otp_attempts").default(0).notNull(),
  otpSentAt: timestamp("otp_sent_at"),
  otpDeliveredAt: timestamp("otp_delivered_at"),
  isVerified: boolean("is_verified").default(false).notNull(),
  // One-time deep-link token: https://t.me/<bot>?start=<token>
  telegramLinkToken: varchar("telegram_link_token", { length: 64 }),
  telegramLinkExpiry: timestamp("telegram_link_expiry"),

  // ── Profile completion ───────────────────────────────────────────
  agreementAccepted: boolean("agreement_accepted").default(false).notNull(),
  agreementAcceptedAt: timestamp("agreement_accepted_at"),
  profileCompleted: boolean("profile_completed").default(false).notNull(),
  companyName: varchar("company_name", { length: 255 }),
  businessDetails: text("business_details"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Projects posted by contractors ──────────────────────────────────
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  contractorId: uuid("contractor_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  wilaya: varchar("wilaya", { length: 120 }).notNull(),
  commune: varchar("commune", { length: 120 }),
  specialty: varchar("specialty", { length: 120 }).notNull(),
  workersNeeded: integer("workers_needed").notNull().default(1),
  dailyWage: integer("daily_wage").notNull(),
  durationDays: integer("duration_days"),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Applications / Matches ──────────────────────────────────────────
export const applications = pgTable("applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  workerId: uuid("worker_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
  decidedBy: uuid("decided_by").references(() => users.id),
});

// ── Telegram notification audit log ─────────────────────────────────
export const notificationLogs = pgTable("notification_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id").references(() => applications.id, {
    onDelete: "set null",
  }),
  recipientRole: varchar("recipient_role", { length: 20 }).notNull(),
  recipientTelegramId: varchar("recipient_telegram_id", { length: 100 }).notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("simulated"),
  telegramMessageId: varchar("telegram_message_id", { length: 100 }),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Admin sessions (opaque tokens, httpOnly cookie) ─────────────────
export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Application = typeof applications.$inferSelect;
