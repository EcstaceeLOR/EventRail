"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

const primaryNavigation = [
  { href: "/markets", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/claims", label: "Claims" },
  { href: "/developers", label: "Developers" },
] as const;

function RailMark() {
  return (
    <span className="rail-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [connected, setConnected] = useState(false);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" onClick={() => setMenuOpen(false)}>
          <RailMark />
          <span>EventRail</span>
          <span className="network-pill">Somnia</span>
        </Link>
        <nav className={menuOpen ? "desktop-nav is-open" : "desktop-nav"} aria-label="Primary navigation">
          {primaryNavigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link className={active ? "nav-link active" : "nav-link"} href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="topbar-actions">
          <span className="live-indicator"><i /> Network live</span>
          <button className="wallet-button" type="button" onClick={() => setConnected((value) => !value)}>
            {connected ? "0x71F…8A2" : "Connect wallet"}
          </button>
          <button className="menu-button" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
            <span />
            <span />
          </button>
        </div>
      </header>
      <main>{children}</main>
      <footer className="footer">
        <div><Link className="brand footer-brand" href="/"><RailMark /><span>EventRail</span></Link><p>Prediction infrastructure that moves at the speed of events.</p></div>
        <div className="footer-links"><Link href="/developers">Build with us</Link><Link href="/status">Status</Link><Link href="/settings">Settings</Link></div>
      </footer>
      <nav className="mobile-tabs" aria-label="Mobile navigation">
        {primaryNavigation.slice(0, 3).map((item) => <Link className={pathname.startsWith(item.href) ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>)}
      </nav>
    </div>
  );
}
