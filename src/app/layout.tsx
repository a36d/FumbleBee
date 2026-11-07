import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "SentinelGraph AI | Insider Threat Investigations",
  description: "Investigate insider threats with AI-powered attack path analysis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
