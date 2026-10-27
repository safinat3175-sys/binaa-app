"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell, Toast, useLang } from "@/components/BinaaShell";
import { T } from "@/lib/i18n";
import { SPECIALTIES } from "@/lib/specialties";
import { WILAYAS } from "@/lib/wilayas";

/* ── types ── */
interface Me {
  id: string; name: string; phone: string; role: string; wilaya: string | null; specialty: string | null;
  companyName: string | null; profileCompleted: boolean; telegramLinked: boolean;
}
interface PubProject {
  id: string; title: string; description: string | null; wilaya: string; specialty: string;
  workersNeeded: number; dailyWage: number; status: string; contractorName: string; applicationsCount: number;
}
interface MineApp { id: string; status: string; projectId: string; projectTitle: string | null; contractorPhone: string | null; contractorName: string | null }
interface MineProject {
  id: string; title: string; wilaya: string; specialty: string; workersNeeded: number; dailyWage: number; status: string;
  applications: { id: string; status: string; workerName: string | null; workerSpecialty: string | null; workerPhone: string | null }[];
}
interface OtpInfo {
  requestId: string; role: string; telegramLinked: boolean; delivered: string; deepLink: string | null;
  botUsername: string | null; devCode?: string; telegramConfigured: boolean;
}

const okPhone = (p: string) => /^(0|\+?213|00213)?\s*[567](\s*\d){8}$/.test(p.trim()) || /^0[567]\d{8}$/.test(p.replace(/\D/g, ""));

export default function Page() {
  const [L, toggle] = useLang();
  const t = T[L];
  const router = useRouter();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  // Landing (two portal cards) → public login form. Pure state switch = instant.
  const [entered, setEntered] = useState(false);
  const show = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  useEffect(() => {
    // Returning visitors who already started registration skip the landing.
    if (localStorage.getItem("binaa_auth")) setEntered(true);
    router.prefetch("/admin");
    router.prefetch("/complete-profile");
  }, [router]);

  const loadMe = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me");
      const d = await r.json();
      setMe(r.ok ? d.user : null);
    } catch { setMe(null); }
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);

  useEffect(() => {
    if (me && !me.profileCompleted) router.replace("/complete-profile");
  }, [me, router]);

  return (
    <Shell L={L} toggle={toggle}>
      {me === undefined ? (
        <p className="binaa-mut">{t.loading}</p>
      ) : me === null ? (
        entered ? (
          <>
            <button className="binaa-back" onClick={() => setEntered(false)}>← {t.backHome}</button>
            <AuthFlow L={L} onLoggedIn={(next) => { if (next === "/") loadMe(); else router.replace(next); }} show={show} />
          </>
        ) : (
          <Landing L={L} onEnter={() => setEntered(true)} />
        )
      ) : me.profileCompleted ? (
        me.role === "worker" ? (
          <WorkerDash L={L} me={me} show={show} onLogout={() => setMe(null)} />
        ) : (
          <ContractorDash L={L} me={me} show={show} onLogout={() => setMe(null)} />
        )
      ) : (
        <p className="binaa-mut">{t.loading}</p>
      )}
      {me && (
        <p className="binaa-note" style={{ textAlign: "center", marginTop: 20 }}>
          <a href="/admin" style={{ color: "var(--mut)" }}>🛡️ {t.admin}</a>
        </p>
      )}
      <Toast msg={toast} />
    </Shell>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LANDING — two portal cards (public vs. admin) + security notice
   ═══════════════════════════════════════════════════════════════ */
function Landing({ L, onEnter }: { L: "ar" | "en"; onEnter: () => void }) {
  const t = T[L];
  return (
    <div className="binaa-anim">
      <div className="binaa-portals">
        <button type="button" className="binaa-portal binaa-portal-public" onClick={onEnter}>
          <span className="binaa-portal-icon">👷🏗️</span>
          <span className="binaa-portal-title">{t.portalPublic}</span>
          <span className="binaa-portal-sub">{t.portalPublicSub}</span>
          <span className="binaa-btn y binaa-portal-cta">{t.portalPublicCta} ←</span>
        </button>

        <a className="binaa-portal binaa-portal-admin" href="/admin">
          <span className="binaa-portal-icon">🛡️</span>
          <span className="binaa-portal-title">{t.portalAdmin}</span>
          <span className="binaa-portal-sub">{t.portalAdminSub}</span>
          <span className="binaa-btn ghost binaa-portal-cta">{t.portalAdminCta} ←</span>
        </a>
      </div>

      <div className="binaa-secure" style={{ marginTop: 14 }}>
        <span>🔒</span>
        <span>{t.secure}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AUTH FLOW: (1) name / role / phone → (2) Telegram OTP → session
   ═══════════════════════════════════════════════════════════════ */
function AuthFlow({ L, onLoggedIn, show }: { L: "ar" | "en"; onLoggedIn: (next: string) => void; show: (m: string) => void }) {
  const t = T[L];
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ name: "", role: "worker", phone: "" });
  const [otp, setOtp] = useState<OtpInfo | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linked, setLinked] = useState(false);
  const [delivered, setDelivered] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("binaa_auth");
      if (raw) setForm((f) => ({ ...f, ...JSON.parse(raw) }));
    } catch { /* ignore */ }
  }, []);

  // cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    const h = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(h);
  }, [cooldown]);

  // poll Telegram link / delivery status while on step 2
  useEffect(() => {
    if (step !== 2 || !otp) return;
    const tick = async () => {
      try {
        const r = await fetch(`/api/auth/status?requestId=${otp.requestId}`);
        const d = await r.json();
        setLinked(!!d.linked);
        setDelivered(!!d.delivered);
      } catch { /* ignore */ }
    };
    tick();
    pollRef.current = window.setInterval(tick, 3000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [step, otp]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    if (!form.name.trim() && step === 1) return setErr(t.fill);
    if (!okPhone(form.phone)) return setErr(t.bad);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 429 && d.retryAfter) setCooldown(d.retryAfter);
        throw new Error(d.error ?? "error");
      }
      localStorage.setItem("binaa_auth", JSON.stringify({ name: form.name, role: d.role ?? form.role, phone: form.phone }));
      setOtp(d);
      setLinked(!!d.telegramLinked);
      setDelivered(d.delivered === "sent" || d.delivered === "simulated");
      setCooldown(45);
      setStep(2);
      setCode("");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "error");
    } finally { setBusy(false); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (code.replace(/\D/g, "").length !== 6) return setErr(t.enterCode);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.phone, code }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? t.wrong);
      show("✅");
      onLoggedIn(d.next ?? "/");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : t.wrong);
    } finally { setBusy(false); }
  }

  return (
    <div className="binaa-anim">
      <div className="binaa-steps"><span className="on" /><span className={step === 2 ? "on" : ""} /><span /></div>
      {err && <p className="binaa-err">{err}</p>}
      <div className="binaa-card">
        <h3 style={{ marginBottom: 12 }}>{t.sub}</h3>

        {step === 1 && (
          <form onSubmit={sendCode}>
            <input placeholder={t.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" autoFocus />
            <input placeholder={t.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" dir="ltr" autoComplete="tel" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="worker">{t.worker}</option>
              <option value="contractor">{t.contractor}</option>
            </select>
            <button className="binaa-btn y full" disabled={busy}>{busy ? "…" : t.sendCode}</button>
            <p className="binaa-note">{t.secure}</p>
          </form>
        )}

        {step === 2 && otp && (
          <form onSubmit={verify}>
            <div className="binaa-row" style={{ marginBottom: 10 }}>
              <span className="binaa-ph">{form.phone}</span>
              <button type="button" className="binaa-btn ghost" onClick={() => { setStep(1); setOtp(null); }}>{t.change}</button>
            </div>

            {/* Telegram deep link — shown until the chat is linked */}
            {!linked && (
              <>
                {otp.deepLink ? (
                  <a className="binaa-btn y full" href={otp.deepLink} target="_blank" rel="noreferrer">{t.openBot}</a>
                ) : otp.botUsername ? (
                  <a className="binaa-btn y full" href={`https://t.me/${otp.botUsername}`} target="_blank" rel="noreferrer">{t.openBot}</a>
                ) : null}
                <p className="binaa-note">{t.botHint}</p>
              </>
            )}

            {delivered ? (
              <p className="binaa-note" style={{ color: "var(--ok)", fontWeight: 600 }}>{t.codeSent}</p>
            ) : (
              <div className="binaa-wait"><i />{t.waiting}</div>
            )}

            {otp.devCode && (
              <p className="binaa-note" style={{ color: "var(--no)" }}>
                {t.simNote} <b className="binaa-ph">{otp.devCode}</b>
              </p>
            )}

            <input
              className="binaa-otp"
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              style={{ marginTop: 10 }}
            />
            <button className="binaa-btn y full" disabled={busy}>{busy ? "…" : t.verify}</button>
            <button type="button" className="binaa-btn ghost full" disabled={cooldown > 0 || busy} onClick={() => sendCode()}>
              {cooldown > 0 ? `${t.resend} (${cooldown})` : t.resend}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   WORKER DASHBOARD
   ═══════════════════════════════════════════════════════════════ */
function specLabel(v: string | null, L: "ar" | "en") {
  const s = SPECIALTIES.find((x) => x.value === v);
  return s ? (L === "ar" ? `${s.ar} (${s.fr})` : `${s.fr} (${s.ar})`) : v ?? "—";
}
function wilLabel(c: string | null, L: "ar" | "en") {
  const w = WILAYAS.find((x) => x.code === c);
  return w ? (L === "ar" ? w.ar : w.fr) : c ?? "—";
}
function stClass(st: string) {
  return st === "approved" ? "binaa-s-approved" : st === "rejected" ? "binaa-s-rejected" : "binaa-s-pending";
}

function UserBar({ me, L, onLogout }: { me: Me; L: "ar" | "en"; onLogout: () => void }) {
  const t = T[L];
  return (
    <div className="binaa-userbar">
      <span className="binaa-pill">{t.verifiedAs}: {me.companyName ?? me.name} · {me.role === "worker" ? "👷" : "🏗️"}</span>
      <button className="binaa-btn ghost" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); onLogout(); }}>{t.logout}</button>
    </div>
  );
}

function WorkerDash({ L, me, show, onLogout }: { L: "ar" | "en"; me: Me; show: (m: string) => void; onLogout: () => void }) {
  const t = T[L];
  const [projects, setProjects] = useState<PubProject[]>([]);
  const [mine, setMine] = useState<MineApp[]>([]);
  const [F, setF] = useState({ w: me.wilaya ?? "-1", s: me.specialty ?? "-1" });
  const [applying, setApplying] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, m] = await Promise.all([fetch("/api/projects").then((r) => r.json()), fetch("/api/mine").then((r) => r.json())]);
    setProjects(p.projects ?? []);
    setMine(m.applications ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const applied = new Set(mine.map((a) => a.projectId));
  const visible = projects.filter((p) => (F.w === "-1" || p.wilaya === F.w) && (F.s === "-1" || p.specialty === F.s));

  async function apply(pid: string) {
    setApplying(pid);
    try {
      const r = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: pid }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      show(t.sent);
      load();
    } catch (e) { show(e instanceof Error ? e.message : "error"); } finally { setApplying(null); }
  }

  return (
    <div className="binaa-anim">
      <UserBar me={me} L={L} onLogout={onLogout} />
      <div className="binaa-card">
        <h3>{t.openPrj}</h3>
        <div className="binaa-grid">
          <select value={F.s} onChange={(e) => setF({ ...F, s: e.target.value })}>
            <option value="-1">{t.spec}: {t.all}</option>
            {SPECIALTIES.map((s) => <option key={s.value} value={s.value}>{L === "ar" ? `${s.ar} (${s.fr})` : `${s.fr} (${s.ar})`}</option>)}
          </select>
          <select value={F.w} onChange={(e) => setF({ ...F, w: e.target.value })}>
            <option value="-1">{t.wil}: {t.all}</option>
            {WILAYAS.map((w) => <option key={w.code} value={w.code}>{L === "ar" ? w.ar : w.fr}</option>)}
          </select>
        </div>
      </div>
      {visible.length ? visible.map((p) => (
        <div className="binaa-card" key={p.id}>
          <h3>{p.title}</h3>
          <div className="binaa-mut">{p.contractorName} · {wilLabel(p.wilaya, L)}</div>
          {p.description && <div className="binaa-mut" style={{ marginTop: 4 }}>{p.description}</div>}
          <div className="binaa-row" style={{ marginTop: 8 }}>
            <span className="binaa-tag">{specLabel(p.specialty, L)} × {p.workersNeeded}</span>
            <b>{p.dailyWage} {t.dc}</b>
            <button className="binaa-btn y" disabled={applied.has(p.id) || applying === p.id || p.status === "closed"} onClick={() => apply(p.id)}>
              {applied.has(p.id) ? t.applied : applying === p.id ? "…" : t.apply}
            </button>
          </div>
        </div>
      )) : <p className="binaa-mut">{t.none}</p>}

      <div className="binaa-card">
        <h3>{t.mine}</h3>
        {mine.length ? mine.map((a) => (
          <div key={a.id} style={{ borderTop: "1px solid var(--bd)", padding: "8px 0" }}>
            <div className="binaa-row"><b>{a.projectTitle}</b><span className={`binaa-tag ${stClass(a.status)}`}>{t[a.status as "pending" | "approved" | "rejected"]}</span></div>
            <div className="binaa-mut">{a.status === "approved" && a.contractorPhone ? <>{t.cp} ({a.contractorName}): <span className="binaa-ph">{a.contractorPhone}</span></> : t.hid}</div>
          </div>
        )) : <p className="binaa-mut">{t.none}</p>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CONTRACTOR DASHBOARD
   ═══════════════════════════════════════════════════════════════ */
function ContractorDash({ L, me, show, onLogout }: { L: "ar" | "en"; me: Me; show: (m: string) => void; onLogout: () => void }) {
  const t = T[L];
  const [f, setF] = useState({ title: "", specialty: "macon", wilaya: me.wilaya ?? "16", workersNeeded: "1", dailyWage: "", description: "" });
  const [mine, setMine] = useState<MineProject[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const m = await fetch("/api/mine").then((r) => r.json());
    setMine(m.projects ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim() || !f.dailyWage || !f.workersNeeded) return show(t.fill);
    setBusy(true);
    try {
      const r = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, workersNeeded: Number(f.workersNeeded), dailyWage: Number(f.dailyWage) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      show(t.posted);
      setF({ ...f, title: "", dailyWage: "", description: "" });
      load();
    } catch (e2) { show(e2 instanceof Error ? e2.message : "error"); } finally { setBusy(false); }
  }

  return (
    <div className="binaa-anim">
      <UserBar me={me} L={L} onLogout={onLogout} />
      <div className="binaa-card">
        <h3>{t.newReq}</h3>
        <form onSubmit={post}>
          <select value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })}>
            {SPECIALTIES.map((s) => <option key={s.value} value={s.value}>{L === "ar" ? `${s.ar} (${s.fr})` : `${s.fr} (${s.ar})`}</option>)}
          </select>
          <select value={f.wilaya} onChange={(e) => setF({ ...f, wilaya: e.target.value })}>
            {WILAYAS.map((w) => <option key={w.code} value={w.code}>{L === "ar" ? w.ar : w.fr}</option>)}
          </select>
          <input placeholder={t.title} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <div className="binaa-grid">
            <input placeholder={t.need} type="number" min={1} inputMode="numeric" value={f.workersNeeded} onChange={(e) => setF({ ...f, workersNeeded: e.target.value })} />
            <input placeholder={`${t.wage.split(" (")[0]} (دج)`} type="number" min={500} inputMode="numeric" value={f.dailyWage} onChange={(e) => setF({ ...f, dailyWage: e.target.value })} />
          </div>
          <textarea className="binaa-input binaa-textarea" placeholder={t.details} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <button className="binaa-btn y full" disabled={busy}>{busy ? "…" : t.post}</button>
        </form>
      </div>

      <div className="binaa-card">
        <h3>{t.myp}</h3>
        {mine.length ? mine.map((p) => {
          const acc = p.applications.filter((a) => a.status === "approved");
          return (
            <div key={p.id} style={{ borderTop: "1px solid var(--bd)", padding: "8px 0" }}>
              <b>{p.title}</b>
              <div className="binaa-mut">{wilLabel(p.wilaya, L)} · {specLabel(p.specialty, L)} × {p.workersNeeded} · {p.applications.length} {t.req} · {p.dailyWage} {t.dc}</div>
              {acc.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <b>{t.accs}</b>
                  {acc.map((a) => (
                    <div className="binaa-row" key={a.id}><span>{a.workerName} · {specLabel(a.workerSpecialty, L)}</span><span className="binaa-ph">{a.workerPhone}</span></div>
                  ))}
                </div>
              )}
            </div>
          );
        }) : <p className="binaa-mut">{t.none}</p>}
      </div>
    </div>
  );
}
