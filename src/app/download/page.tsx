import type { Metadata } from "next";

export const metadata: Metadata = { title: "تحميل المشروع — بناء | Binaa" };

const ZIP = "/download/binaa-fullstack.zip";

export default function DownloadPage() {
  return (
    <main className="binaa-main" dir="rtl">
      <div className="binaa-card binaa-anim">
        <h3 style={{ fontSize: 20 }}>📦 تحميل مشروع بناء | Binaa</h3>
        <p className="binaa-mut" style={{ marginTop: 0 }}>
          الكود الكامل (Next.js + PostgreSQL + Telegram OTP + بوابة الإدارة) جاهز للرفع إلى GitHub ثم النشر على Vercel.
        </p>

        <a className="binaa-btn y full" href={ZIP} download="binaa-fullstack.zip" style={{ fontSize: 18, padding: 16 }}>
          ⬇️ تحميل ZIP
        </a>
        <p className="binaa-note" style={{ color: "var(--ok)", fontWeight: 600 }}>
          ✅ لا يحتوي على <code>.env</code> أو مفاتيح سرية · ✅ بدون node_modules (Vercel يثبّتها تلقائياً)
        </p>

        <h3 style={{ marginTop: 16 }}>📱 الرفع إلى GitHub من الهاتف</h3>
        <ol style={{ paddingInlineStart: 20, fontSize: 14 }}>
          <li>فكّ ضغط الملف (تطبيق «الملفات» أو ZArchiver).</li>
          <li>افتح مستودعك على <code>github.com</code> في المتصفح (وضع سطح المكتب يسهّل الأمر).</li>
          <li>احذف <code>index.html</code> القديم: افتحه → ✏️ → 🗑️ <b>Delete file</b> → Commit.</li>
          <li><b>Add file → Upload files</b> → اختر كل الملفات والمجلدات من المجلد المفكوك (<code>src</code>، <code>public</code>، <code>scripts</code>، <code>supabase</code>، <code>package.json</code>…).</li>
          <li>اكتب رسالة مثل <code>Binaa full-stack</code> → <b>Commit changes</b>.</li>
          <li>تأكد أن <code>.gitignore</code> و <code>package.json</code> و <code>src/app/page.tsx</code> ظاهرة في المستودع.</li>
        </ol>

        <h3 style={{ marginTop: 16 }}>🚀 ثم على Vercel</h3>
        <ol style={{ paddingInlineStart: 20, fontSize: 14 }}>
          <li><code>vercel.com/new</code> → Import المستودع.</li>
          <li>أضف المتغيرات: <code>DATABASE_URL</code>، <code>TELEGRAM_BOT_TOKEN</code>، <code>TELEGRAM_BOT_USERNAME</code>، <code>TELEGRAM_WEBHOOK_SECRET</code>، <code>OTP_PEPPER</code>.</li>
          <li>Deploy → افتح <code>/admin</code> → دخول بالهاتف وكلمة السر → تبويب تيليغرام → <b>🔐 تفعيل Webhook الآمن</b>.</li>
        </ol>
        <p className="binaa-note">الدليل الكامل داخل الملف: <code>DEPLOY.md</code> · SQL قاعدة البيانات: <code>supabase/setup.sql</code></p>
      </div>
    </main>
  );
}
