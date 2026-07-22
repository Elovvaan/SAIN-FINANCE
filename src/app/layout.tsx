import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAIN Financial | The trusted destination for your paycheck",
  description:
    "SAIN Financial is building a payroll-centered financial platform designed around a Financial Kernel that prioritizes accuracy, transparency, and trust.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
