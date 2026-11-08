import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "CloudFusion — Virtual Cloud Storage Platform",
  description:
    "Pool multiple Google Drive accounts into one virtual storage dashboard. Remote direct-link downloads stream cloud-to-cloud — zero bytes ever touch your phone.",
};

export const viewport: Viewport = {
  themeColor: "#04060d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
