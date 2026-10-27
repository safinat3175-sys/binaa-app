"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell, Toast, useLang } from "@/components/BinaaShell";
import { T } from "@/lib/i18n";
import { SPECIALTIES } from "@/lib/specialties";
import { WILAYAS } from "@/lib/wilayas";

interface Me {
  id: string; name: string; role: string; wilaya: string | null; specialty: string | null;
  dailyWageExpectation: number | null; experienceYears: number | null; companyName: string | null;
  businessDetails: string | null; profileCompleted: boolean;
}

export default function CompleteProfilePage() {
  const [L, toggle] = useLang();
  const t = T[L];
  const router = useRouter();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [f, setF] = useState({ name: "", specialty: "ferrailleur", wilaya: "16", dailyWageExpectation: "", experienceYears: "0", companyName: "", businessDetails: "", agreement: false });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.replace("/"); return; }
      const d = await r.json();
      const u: Me = d.user;
      setMe(u);
      setF((x) => ({
        ...x,
        name: u.name ?? "",
        specialty: u.specialty ?? "ferrailleur",
        wilaya: u.wilaya ?? "16",
        dailyWageExpectation: u.dailyWageExpectation ? String(u.dailyWageExpectation) : "",
        experienceYears: String(u.experienceYears ?? 0),
        companyName: u.companyName ?? "",
        businessDetails: u.businessDetails ?? "",
      }));
    }).catch(() => router.replace("/"));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!f.agreement) return setErr(t.mustAgree);
    if (me?.role === "worker" && (!f.dailyWageExpectation || Number(f.dailyWageExpectation) < 500)) return setErr(t.fill);
    if (me?.role === "contractor" && f.companyName.trim().length < 2) return setErr(t.fill);
    setBusy(true);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          dailyWageExpectation: Number(f.dailyWageExpectation) || 0,
          experienceYears: Number(f.experienceYears) || 0,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "error");
      setToast("✅");
      router.replace("/");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "error");
    } finally { setBusy(false); }
  }

  return (
    <Shell L={L} toggle={toggle}>
      {me === undefined ? (
        <p className="binaa-mut">{t.loading}</p>
      ) : me && (
        <div className="binaa-anim">
          <div className="binaa-steps"><span className="on" /><span className="on" /><span className="on" /></div>
          {err && <p className="binaa-err">{err}</p>}
          <div className="binaa-card">
            <h3>{t.completeTitle} · {me.role === "worker" ? "👷" : "🏗️"}</h3>
            <p className="binaa-mut" style={{ marginTop: 0 }}>{t.completeSub}</p>
            <form onSubmit={submit}>
              <label>{t.name}</label>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />

              {me.role === "worker" ? (
                <>
                  <label>{t.spec}</label>
                  <select value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })}>
                    {SPECIALTIES.map((s) => (
                      <option key={s.value} value={s.value}>{s.icon} {L === "ar" ? `${s.ar} (${s.fr})` : `${s.fr} (${s.ar})`}</option>
                    ))}
                  </select>
                  <label>{t.wil}</label>
                  <select value={f.wilaya} onChange={(e) => setF({ ...f, wilaya: e.target.value })}>
                    {WILAYAS.map((w) => <option key={w.code} value={w.code}>{w.code} · {L === "ar" ? w.ar : w.fr}</option>)}
                  </select>
                  <div className="binaa-grid">
                    <div>
                      <label>{t.wage}</label>
                      <input type="number" min={500} inputMode="numeric" dir="ltr" placeholder="3000" value={f.dailyWageExpectation} onChange={(e) => setF({ ...f, dailyWageExpectation: e.target.value })} />
                    </div>
                    <div>
                      <label>{t.exp}</label>
                      <input type="number" min={0} max={60} inputMode="numeric" dir="ltr" value={f.experienceYears} onChange={(e) => setF({ ...f, experienceYears: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label>{t.company}</label>
                  <input value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} />
                  <label>{t.wil}</label>
                  <select value={f.wilaya} onChange={(e) => setF({ ...f, wilaya: e.target.value })}>
                    {WILAYAS.map((w) => <option key={w.code} value={w.code}>{w.code} · {L === "ar" ? w.ar : w.fr}</option>)}
                  </select>
                  <label>{t.business}</label>
                  <textarea className="binaa-input binaa-textarea" value={f.businessDetails} onChange={(e) => setF({ ...f, businessDetails: e.target.value })} />
                </>
              )}

              <details className="binaa-terms">
                <summary>{t.termsTitle}</summary>
                <ul style={{ paddingInlineStart: 18, margin: "6px 0" }}>
                  <li>{L === "ar" ? "رقم هاتفك لا يُعرض لأي مستخدم على الموقع أو عبر البوت." : "Your phone number is never displayed to other users on the site or via the bot."}</li>
                  <li>{L === "ar" ? "يُرسل رقمك فقط للطرف المقابل في مطابقة وافقت عليها الإدارة، عبر رسالة تيليغرام خاصة." : "Your number is sent only to the counter-party of a match approved by the admin, via a private Telegram message."}</li>
                  <li>{L === "ar" ? "المنصة وسيط فقط ولا تتحمل مسؤولية الاتفاقات بين الطرفين." : "The platform is an intermediary only and is not party to agreements between users."}</li>
                  <li>{L === "ar" ? "يمكنك طلب حذف حسابك وبياناتك في أي وقت." : "You can request deletion of your account and data at any time."}</li>
                </ul>
              </details>
              <label className="binaa-check">
                <input type="checkbox" checked={f.agreement} onChange={(e) => setF({ ...f, agreement: e.target.checked })} />
                <span>{t.agree}</span>
              </label>

              <button className="binaa-btn y full" disabled={busy || !f.agreement}>{busy ? "…" : t.submitApp}</button>
            </form>
          </div>
        </div>
      )}
      <Toast msg={toast} />
    </Shell>
  );
}
