"use client";

import { useEffect, useState, type ReactNode } from "react";
import { T, type Lang } from "@/lib/i18n";

export function useLang(): [Lang, () => void] {
  const [L, setL] = useState<Lang>("ar");
  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("binaa_lang")) as Lang | null;
    if (saved === "ar" || saved === "en") setL(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = L;
    document.documentElement.dir = L === "ar" ? "rtl" : "ltr";
    localStorage.setItem("binaa_lang", L);
  }, [L]);
  return [L, () => setL(L === "ar" ? "en" : "ar")];
}

export function Shell({ L, toggle, children }: { L: Lang; toggle: () => void; children: ReactNode }) {
  const t = T[L];
  const toggleTheme = () => {
    const root = document.documentElement;
    root.setAttribute("data-theme", root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  };
  return (
    <>
      <header className="binaa-header">
        <div className="binaa-top">
          <h1>
            {t.brand} <span style={{ opacity: 0.85 }}>{L === "ar" ? "Binaa" : "بناء"}</span>
            <small>{t.sub}</small>
          </h1>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="binaa-theme" onClick={toggleTheme} aria-label="theme">🌙</button>
            <button className="binaa-lang" onClick={toggle}>{L === "ar" ? "EN" : "عربي"}</button>
          </div>
        </div>
      </header>
      <main className="binaa-main">{children}</main>
    </>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  return (
    <div id="binaa-toast" role="status" className={msg ? "show" : ""}>
      {msg}
    </div>
  );
}
