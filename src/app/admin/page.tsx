"use client";

import { useCallback, useEffect, useState } from "react";
import { Shell, Toast, useLang } from "@/components/BinaaShell";
import { SPECIALTIES } from "@/lib/specialties";
import { WILAYAS } from "@/lib/wilayas";

interface Admin { id: string; name: string; phone?: string }
interface App {
  id: string; status: string; message: string | null; createdAt: string;
  worker: { name: string; phone: string; telegramId: string | null; specialty: string | null; wilaya: string | null; experienceYears: number | null } | null;
  project: { title: string; wilaya: string; specialty: string; dailyWage: number } | null;
  contractor: { name: string; phone: string; telegramId: string | null } | null;
}
interface Proj {
  id: string; title: string; wilaya: string; specialty: string; workersNeeded: number; dailyWage: number; status: string;
  contractor: { name: string; phone: string; telegramId: string | null } | null; applicationsCount: number; approvedCount: number;
}
interface U {
  id: string; name: string; phone: string; telegramId: string | null; specialty: string | null; wilaya: string | null; role: string;
  isVerified?: boolean; agreementAccepted?: boolean; profileCompleted?: boolean; companyName?: string | null;
}
interface Notif { id: string; recipientRole: string; recipientTelegramId: string; message: string; status: string; error: string | null; createdAt: string }

const TX = {
  ar: {
    login: "تسجيل دخول الإدارة", phone: "رقم الهاتف", pass: "كلمة السر", enter: "تسجيل الدخول", bad: "خطأ في بيانات الدخول",
    queue: "طلبات بانتظار القرار", decided: "طلبات تم البت فيها", projects: "المشاريع", users: "المستخدمون", tg: "تيليغرام",
    acc: "قبول + إرسال الأرقام 📲", rej: "رفض", none: "لا توجد عناصر.", logout: "خروج", refresh: "تحديث",
    pending: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض", wp: "هاتف العامل", cp: "هاتف المقاول",
    stats: ["مشاريع", "بانتظار", "مقبولون"], confirmAcc: "قبول الطلب وإرسال رقم كل طرف للآخر عبر تيليغرام؟", confirmRej: "رفض الطلب؟",
    noTg: "⚠️ أحد الطرفين لم يربط تيليغرام — سيُسجَّل الإشعار كفاشل", verified: "موثّق", unverified: "غير موثّق",
    links: "الروابط", publicLink: "رابط العمال والمقاولين", adminLink: "رابط المدير (خاص)", copy: "نسخ", copied: "تم النسخ ✅",
    botStatus: "حالة البوت", setup: "🔐 تفعيل Webhook الآمن", log: "سجل الإشعارات", del: "حذف", worker: "عامل", contractor: "مقاول", admin: "مدير",
    exp: "خبرة", years: "سنوات", req: "طلب", status: "الحالة",
  },
  en: {
    login: "Admin login", phone: "Phone number", pass: "Password", enter: "Log in", bad: "Invalid credentials",
    queue: "Requests awaiting a decision", decided: "Decided requests", projects: "Projects", users: "Users", tg: "Telegram",
    acc: "Approve + send numbers 📲", rej: "Reject", none: "Nothing here.", logout: "Logout", refresh: "Refresh",
    pending: "Under review", approved: "Accepted", rejected: "Rejected", wp: "Worker phone", cp: "Contractor phone",
    stats: ["Projects", "Pending", "Accepted"], confirmAcc: "Approve and send each party's number to the other via Telegram?", confirmRej: "Reject this request?",
    noTg: "⚠️ One party has no Telegram linked — notification will be logged as failed", verified: "Verified", unverified: "Unverified",
    links: "Links", publicLink: "Workers & contractors link", adminLink: "Admin link (private)", copy: "Copy", copied: "Copied ✅",
    botStatus: "Bot status", setup: "🔐 Enable secure webhook", log: "Notification log", del: "Delete", worker: "Worker", contractor: "Contractor", admin: "Admin",
    exp: "Exp.", years: "yrs", req: "request", status: "Status",
  },
} as const;

const spec = (v: string | null | undefined, L: "ar" | "en") => { const s = SPECIALTIES.find((x) => x.value === v); return s ? (L === "ar" ? s.ar : s.fr) : v ?? "—"; };
const wil = (c: string | null | undefined, L: "ar" | "en") => { const w = WILAYAS.find((x) => x.code === c); return w ? (L === "ar" ? w.ar : w.fr) : c ?? "—"; };
const st = (s: string) => (s === "approved" ? "binaa-s-approved" : s === "rejected" ? "binaa-s-rejected" : "binaa-s-pending");

export default function AdminPage() {
  const [L, toggle] = useLang();
  const t = TX[L];
  const [admin, setAdmin] = useState<Admin | null | undefined>(undefined);
  const [cred, setCred] = useState({ identifier: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"queue" | "projects" | "users" | "tg">("queue");
  const [apps, setApps] = useState<App[]>([]);
  const [projects, setProjects] = useState<Proj[]>([]);
  const [users, setUsers] = useState<U[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [counts, setCounts] = useState({ projects: 0, pending: 0, approved: 0 });
  const [tg, setTg] = useState<{ configured: boolean; mode: string; bot: { username: string } | null } | null>(null);
  const [origin, setOrigin] = useState("");
  const show = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/overview");
    if (r.status === 401) { setAdmin(null); return; }
    const d = await r.json();
    setApps(d.applications ?? []); setProjects(d.projects ?? []); setUsers(d.users ?? []); setNotifs(d.notifications ?? []);
    setCounts({ projects: d.counts?.projects ?? 0, pending: d.counts?.pending ?? 0, approved: d.counts?.approved ?? 0 });
    fetch("/api/telegram/status").then((x) => x.json()).then(setTg).catch(() => null);
  }, []);

  useEffect(() => {
    fetch("/api/admin/me").then(async (r) => {
      const d = await r.json();
      if (r.ok && d.admin) { setAdmin(d.admin); load(); } else setAdmin(null);
    }).catch(() => setAdmin(null));
  }, [load]);

  async function login(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cred) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? t.bad);
      setAdmin(d.admin); setCred({ identifier: "", password: "" }); load();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : t.bad); } finally { setBusy(false); }
  }

  async function decide(id: string, action: "approve" | "reject") {
    if (!confirm(action === "approve" ? t.confirmAcc : t.confirmRej)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/applications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const n = (d.notifications ?? []).map((x: { role: string; status: string }) => `${x.role}: ${x.status}`).join(" · ");
      show(action === "approve" ? `✅ ${n || "approved"}` : "❌ " + t.rejected);
      load();
    } catch (e2) { show(e2 instanceof Error ? e2.message : "error"); } finally { setBusy(false); }
  }

  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); show(t.copied); } catch { prompt(t.copy, s); } };

  /* ── Login screen ── */
  if (admin === undefined) return <Shell L={L} toggle={toggle}><p className="binaa-mut">…</p></Shell>;
  if (!admin) {
    return (
      <Shell L={L} toggle={toggle}>
        <div className="binaa-anim">
          {err && <p className="binaa-err">{err}</p>}
          <div className="binaa-card">
            <h3 style={{ marginBottom: 12 }}>{t.login}</h3>
            <form onSubmit={login}>
              <input placeholder={t.phone} value={cred.identifier} onChange={(e) => setCred({ ...cred, identifier: e.target.value })} inputMode="tel" dir="ltr" autoComplete="username" />
              <input placeholder={t.pass} type="password" value={cred.password} onChange={(e) => setCred({ ...cred, password: e.target.value })} dir="ltr" autoComplete="current-password" />
              <button className="binaa-btn y full" disabled={busy}>{busy ? "…" : t.enter}</button>
            </form>
          </div>
          <p className="binaa-note" style={{ textAlign: "center" }}><a href="/" style={{ color: "var(--mut)" }}>← بناء | Binaa</a></p>
        </div>
        <Toast msg={toast} />
      </Shell>
    );
  }

  const pending = apps.filter((a) => a.status === "pending");
  const done = apps.filter((a) => a.status !== "pending");

  return (
    <Shell L={L} toggle={toggle}>
      <div className="binaa-anim">
        <div className="binaa-userbar">
          <span className="binaa-pill">🛡️ {admin.name}</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button className="binaa-btn ghost" onClick={load}>{t.refresh}</button>
            <button className="binaa-btn ghost" onClick={async () => { await fetch("/api/admin/logout", { method: "POST" }); setAdmin(null); }}>{t.logout}</button>
          </span>
        </div>

        <div className="binaa-stats">
          <div><b>{counts.projects}</b>{t.stats[0]}</div>
          <div><b style={{ color: "var(--hv)" }}>{counts.pending}</b>{t.stats[1]}</div>
          <div><b style={{ color: "var(--ok)" }}>{counts.approved}</b>{t.stats[2]}</div>
        </div>

        <div className="binaa-tabs">
          <button className={tab === "queue" ? "on" : ""} onClick={() => setTab("queue")}>📥 {counts.pending}</button>
          <button className={tab === "projects" ? "on" : ""} onClick={() => setTab("projects")}>{t.projects}</button>
          <button className={tab === "users" ? "on" : ""} onClick={() => setTab("users")}>{t.users}</button>
          <button className={tab === "tg" ? "on" : ""} onClick={() => setTab("tg")}>{t.tg}</button>
        </div>

        {/* ── Queue: approve / match ── */}
        {tab === "queue" && (
          <>
            <h2>{t.queue}</h2>
            {pending.length ? pending.map((a) => (
              <div className="binaa-card" key={a.id}>
                <div className="binaa-row">
                  <h3>{a.worker?.name} <span className="binaa-tag">{spec(a.worker?.specialty, L)}</span></h3>
                  <span className="binaa-mut">{new Date(a.createdAt).toLocaleDateString("fr-DZ")}</span>
                </div>
                <div className="binaa-mut">
                  👷 {t.wp}: <span className="binaa-ph">{a.worker?.phone}</span> · {wil(a.worker?.wilaya, L)} · {t.exp} {a.worker?.experienceYears ?? 0} {t.years} {a.worker?.telegramId ? "· ✈️" : ""}
                  <br />
                  🏗️ {a.project?.title} · {a.project?.dailyWage} دج · {wil(a.project?.wilaya, L)}
                  <br />
                  👤 {a.contractor?.name} · {t.cp}: <span className="binaa-ph">{a.contractor?.phone}</span> {a.contractor?.telegramId ? "· ✈️" : ""}
                </div>
                {a.message && <div className="binaa-mut" style={{ marginTop: 4 }}>💬 {a.message}</div>}
                {(!a.worker?.telegramId || !a.contractor?.telegramId) && <p className="binaa-note" style={{ color: "var(--no)" }}>{t.noTg}</p>}
                <div className="binaa-row" style={{ marginTop: 8 }}>
                  <button className="binaa-btn ok" disabled={busy} onClick={() => decide(a.id, "approve")}>{t.acc}</button>
                  <button className="binaa-btn no" disabled={busy} onClick={() => decide(a.id, "reject")}>{t.rej}</button>
                </div>
              </div>
            )) : <p className="binaa-mut">{t.none}</p>}

            <h2>{t.decided}</h2>
            {done.length ? done.map((a) => (
              <div className="binaa-card binaa-row" key={a.id}>
                <span>{a.worker?.name} → {a.project?.title}</span>
                <span className={`binaa-tag ${st(a.status)}`}>{t[a.status as "approved" | "rejected"]}</span>
              </div>
            )) : <p className="binaa-mut">{t.none}</p>}
          </>
        )}

        {/* ── Projects ── */}
        {tab === "projects" && (projects.length ? projects.map((p) => (
          <div className="binaa-card" key={p.id}>
            <div className="binaa-row"><h3>{p.title}</h3>
              <select className="binaa-input" style={{ width: "auto", margin: 0 }} value={p.status} onChange={async (e) => { await fetch("/api/projects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, status: e.target.value }) }); load(); }}>
                <option value="open">open</option><option value="matched">matched</option><option value="closed">closed</option>
              </select>
            </div>
            <div className="binaa-mut">{wil(p.wilaya, L)} · {spec(p.specialty, L)} × {p.workersNeeded} · {p.dailyWage} دج · {p.approvedCount}/{p.workersNeeded} ✅ · {p.applicationsCount} {t.req}</div>
            <div className="binaa-mut">👤 {p.contractor?.name} · <span className="binaa-ph">{p.contractor?.phone}</span></div>
            <button className="binaa-btn no" style={{ marginTop: 8 }} onClick={async () => { if (!confirm("?")) return; await fetch(`/api/projects?id=${p.id}`, { method: "DELETE" }); load(); }}>{t.del}</button>
          </div>
        )) : <p className="binaa-mut">{t.none}</p>)}

        {/* ── Users ── */}
        {tab === "users" && users.map((u) => (
          <div className="binaa-card" key={u.id}>
            <div className="binaa-row">
              <h3>{u.companyName ?? u.name} <span className="binaa-tag">{u.role === "worker" ? t.worker : u.role === "contractor" ? t.contractor : t.admin}</span></h3>
              {u.role !== "admin" && <span className={`binaa-tag ${u.isVerified ? "binaa-s-approved" : "binaa-s-pending"}`}>{u.isVerified ? "✅ " + t.verified : "⏳ " + t.unverified}</span>}
            </div>
            <div className="binaa-mut">
              <span className="binaa-ph">{u.phone}</span> · {u.telegramId ? "✈️ " + u.telegramId : "✈️ —"} · {spec(u.specialty, L)} · {wil(u.wilaya, L)}
              {u.role !== "admin" && <> · {u.agreementAccepted ? "📝 ✓" : "📝 ✗"}</>}
            </div>
            {u.role !== "admin" && (
              <button className="binaa-btn no" style={{ marginTop: 8 }} onClick={async () => { if (!confirm(t.del + "?")) return; const r = await fetch(`/api/admin/overview?id=${u.id}`, { method: "DELETE" }); if (r.ok) load(); }}>{t.del}</button>
            )}
          </div>
        ))}

        {/* ── Telegram & links ── */}
        {tab === "tg" && (
          <>
            <div className="binaa-card">
              <h3>🔗 {t.links}</h3>
              <label>{t.publicLink}</label>
              <div className="binaa-row"><span className="binaa-ph" style={{ fontWeight: 600, wordBreak: "break-all" }}>{origin}/</span><button className="binaa-btn ghost" onClick={() => copy(`${origin}/`)}>{t.copy}</button></div>
              <label style={{ marginTop: 8 }}>{t.adminLink}</label>
              <div className="binaa-row"><span className="binaa-ph" style={{ fontWeight: 600, wordBreak: "break-all" }}>{origin}/admin</span><button className="binaa-btn ghost" onClick={() => copy(`${origin}/admin`)}>{t.copy}</button></div>
            </div>
            <div className="binaa-card">
              <h3>🤖 {t.botStatus}</h3>
              <div className="binaa-mut" dir="ltr" style={{ textAlign: "left" }}>
                mode: <b>{tg?.mode ?? "?"}</b> · bot: {tg?.bot ? `@${tg.bot.username}` : "— (set TELEGRAM_BOT_TOKEN)"}
              </div>
              <p className="binaa-note">TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET → {t.setup}</p>
              <button className="binaa-btn full" onClick={async () => {
                const r = await fetch("/api/telegram/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
                const d = await r.json(); show(d.ok ? `✅ ${d.url}` : `❌ ${d.error ?? d.description ?? "failed"}`);
              }}>{t.setup}</button>
            </div>
            <div className="binaa-card">
              <h3>📜 {t.log} ({notifs.length})</h3>
              {notifs.length ? notifs.map((n) => (
                <div key={n.id} style={{ borderTop: "1px solid var(--bd)", padding: "6px 0", fontSize: 13 }}>
                  <div className="binaa-row"><span className={`binaa-tag ${n.status === "sent" ? "binaa-s-approved" : n.status === "simulated" ? "binaa-s-pending" : "binaa-s-rejected"}`}>{n.status}</span><span className="binaa-mut">{n.recipientRole} → {n.recipientTelegramId} · {new Date(n.createdAt).toLocaleString("fr-DZ")}</span></div>
                  <div className="binaa-mut" style={{ whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>{n.message.replace(/<[^>]+>/g, "")}</div>
                  {n.error && <div style={{ color: "var(--no)" }}>⚠️ {n.error}</div>}
                </div>
              )) : <p className="binaa-mut">{t.none}</p>}
            </div>
          </>
        )}
      </div>
      <Toast msg={toast} />
    </Shell>
  );
}
