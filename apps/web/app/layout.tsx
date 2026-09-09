import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/app-shell";
import { Providers } from "../components/providers";
import "@eventrail/react/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EventRail", template: "%s · EventRail" },
  description: "Trade and integrate DreamDEX Event Contracts on Somnia.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
