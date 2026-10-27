import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "بناء | Binaa — منصة العمل في البناء",
  description:
    "منصة بناء تربط المقاولين بالعمال في الجزائر. الهواتف مخفية عن العموم وتُكشف فقط بعد موافقة الإدارة مع إشعار تيليغرام تلقائي.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
