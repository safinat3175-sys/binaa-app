# 🚀 Binaa | بناء — Production Deployment Guide

Target: a permanent 24/7 URL on **Vercel** (`https://<name>.vercel.app`) with a free
cloud **PostgreSQL** on **Neon** and the Telegram bot running live.

Total time: ~20 minutes. Nothing runs on your phone or laptop afterwards.

---

## 0. Prerequisites (free accounts)

| Service | Purpose | Sign up |
|---|---|---|
| GitHub | hosts the code | https://github.com |
| Vercel | hosts the Next.js app | https://vercel.com (sign in with GitHub) |
| Neon | free PostgreSQL | https://neon.tech (sign in with GitHub) |
| Telegram @BotFather | your bot token | inside Telegram |

---

## 1. Push the code to GitHub

```bash
# inside the project folder
git init
git add .
git commit -m "Binaa production"
# create an empty repo on github.com (e.g. binaa), then:
git remote add origin https://github.com/<your-user>/binaa.git
git branch -M main
git push -u origin main
```

> `.env` is git-ignored — secrets never leave your machine.

---

## 2. Create the free PostgreSQL database (Neon)

1. Go to https://console.neon.tech → **New Project**
   - Name: `binaa` · Region: **AWS eu-central-1 (Frankfurt)** (closest to Algeria) · Postgres 16
2. On the project dashboard click **Connect** → choose **Connection string** → tick **Pooled connection**.
3. Copy the URL. It looks like:
   ```
   postgresql://neondb_owner:npg_xxxx@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
   This is your **`DATABASE_URL`**.

### 📱 No terminal? (phone-only setup)
Open your database's **SQL Editor** (Supabase → SQL Editor → *New query*; Neon → *SQL Editor*),
paste the entire contents of **`supabase/setup.sql`** and press **Run**.
It creates all tables **and** the admin account (`0663471513` / `Binaa@2026`).
Change the password afterwards with the pgcrypto snippet at the bottom of that file.
Then skip to step 3.

### Create the tables & your admin account (run once from your computer)

```bash
# 1) point the CLI at the cloud DB
export DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"

# 2) create all tables (users, projects, applications, notification_logs, sessions)
npx drizzle-kit push

# 3) create the admin (choose a STRONG password)
ADMIN_PHONE=0663471513 ADMIN_PASSWORD='YourStrongPass!2026' node scripts/seed-admin.mjs
```

Expected output: `[✓] Changes applied` then `✅ Admin created → phone 0663471513`.

<details>
<summary>Alternative: Supabase instead of Neon</summary>

Supabase → New project → Settings → Database → **Connection string → URI**, mode **Transaction pooler** (port 6543).
Use that as `DATABASE_URL` and append `?sslmode=require` if missing. Everything else is identical.
</details>

---

## 3. Create the Telegram bot

1. In Telegram open **@BotFather** → `/newbot` → name `بناء | Binaa` → username e.g. `BinaaDZbot`.
2. Copy the token → **`TELEGRAM_BOT_TOKEN`** (format `123456789:AAH…`).
3. Note the username without @ → **`TELEGRAM_BOT_USERNAME`** = `BinaaDZbot`.
4. (Optional) `/setdescription` → "بوت رموز التحقق وإشعارات المطابقة لمنصة بناء".

Generate two random secrets (run twice, keep both):

```bash
openssl rand -hex 24
```
→ first value = **`TELEGRAM_WEBHOOK_SECRET`**, second = **`OTP_PEPPER`**.
(No terminal? use https://generate-secret.vercel.app/32)

---

## 4. Deploy on Vercel

1. https://vercel.com/new → **Import** your `binaa` GitHub repo.
2. Framework preset: **Next.js** (auto-detected). Leave build settings default.
3. **Before clicking Deploy**, open **Environment Variables** and add every row from the table below
   (tick *Production* and *Preview*).
4. Click **Deploy**. ~2 minutes later you get `https://binaa-xxxx.vercel.app`.

### Environment variables to add in Vercel

| Variable | Value | Required |
|---|---|---|
| `DATABASE_URL` | Neon pooled connection string (step 2) | ✅ |
| `TELEGRAM_BOT_TOKEN` | from @BotFather (step 3) | ✅ |
| `TELEGRAM_WEBHOOK_SECRET` | random hex ≥ 16 chars | ✅ |
| `OTP_PEPPER` | random hex | ✅ |
| `TELEGRAM_BOT_USERNAME` | e.g. `BinaaDZbot` (no @) | recommended |
| `DATABASE_POOL_MAX` | `5` | optional |

> Do **not** add `OTP_DEV_ECHO` in production.

If you add/change a variable later: **Deployments → ⋯ → Redeploy**.

---

## 5. Activate the secure Telegram webhook (one click)

1. Open `https://<your-app>.vercel.app/admin`
2. Log in with your admin **phone** + **password** from step 2.
3. Tab **تيليغرام** → press **🔐 تفعيل Webhook الآمن**.
   You should see `✅ https://<your-app>.vercel.app/api/telegram/webhook`.

Telegram will now call your app with the secret header; any request without it is rejected (403).

### Test the live flow
1. Open `https://<your-app>.vercel.app/` on your phone.
2. Enter name + phone → **دخول / إرسال الرمز** → **افتح بوت تلغرام** → press *Start*.
3. The bot sends `🔐 Binaa: 123456` → type it in the site → **تأكيد** → complete profile.
4. As admin, approve a request → both parties receive each other's phone number privately.

---

## 6. Your permanent links

| Who | URL |
|---|---|
| Workers & contractors | `https://<your-app>.vercel.app/` |
| Admin (private) | `https://<your-app>.vercel.app/admin` |
| Telegram bot | `https://t.me/<TELEGRAM_BOT_USERNAME>` |

**Custom domain (optional):** Vercel → Project → Settings → Domains → add `binaa.dz` (or any domain) and
follow the DNS instructions. Then re-run step 5 so the webhook points to the new domain.

---

## 7. Operations cheat-sheet

| Task | How |
|---|---|
| Change admin password | `DATABASE_URL=... ADMIN_PASSWORD='New!' node scripts/seed-admin.mjs` |
| Update code | `git push` → Vercel auto-deploys |
| Schema change | edit `src/db/schema.ts` → `npx drizzle-kit push` against the cloud URL → push code |
| View logs | Vercel → Project → **Logs** |
| Backups | Neon → Branches / Restore (point-in-time, free tier keeps 24 h) |
| Rotate webhook secret | change `TELEGRAM_WEBHOOK_SECRET` in Vercel → Redeploy → press the webhook button again |

### Free-tier limits (plenty for launch)
- **Vercel Hobby**: 100 GB bandwidth/month, serverless functions, always-on URL.
- **Neon Free**: 0.5 GB storage, auto-suspends after 5 min idle and wakes in ~500 ms on the first request (users won't notice).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails: `DATABASE_URL is required` | Variable missing in Vercel env → add it → Redeploy |
| `self signed certificate` / SSL error | Ensure the URL ends with `?sslmode=require` |
| Bot doesn't reply | Step 5 not done, or `TELEGRAM_WEBHOOK_SECRET` missing (webhook returns 503 until set) |
| "Wrong code" every time | Check the OTP arrived from **your** bot and was entered within 5 minutes |
| Admin login fails | Re-run `seed-admin.mjs` against the **cloud** `DATABASE_URL` |
