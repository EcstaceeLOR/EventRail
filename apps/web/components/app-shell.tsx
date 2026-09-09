"use client";

import { StatusBadge, useToast } from "@eventrail/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { WalletControl } from "./wallet-provider";

const primaryNavigation = [
  { href: "/markets", label: "Markets", short: "Explore" },
  { href: "/portfolio", label: "Portfolio", short: "Portfolio" },
  { href: "/claims", label: "Claims", short: "Claims" },
  { href: "/developers", label: "Developers", short: "Build" },
] as const;

const utilityNavigation = [
  { href: "/developers/dashboard", label: "API dashboard" },
  { href: "/developers/design-system", label: "Design system" },
  { href: "/status", label: "System status" },
  { href: "/settings", label: "Settings" },
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

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem("eventrail-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("eventrail-theme", theme);
  }, [theme]);

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <RailMark />
          <span>EventRail</span>
          <span className="network-pill">Shannon</span>
        </Link>
        <nav className={menuOpen ? "desktop-nav is-open" : "desktop-nav"} aria-label="Primary navigation">
          {primaryNavigation.map((item) => (
            <Link
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={isActive(pathname, item.href) ? "nav-link active" : "nav-link"}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
          <div className="mobile-menu-utilities">
            {utilityNavigation.map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
        <div className="topbar-actions">
          <StatusBadge tone="live">Network live</StatusBadge>
          <button
            className="icon-action"
            type="button"
            aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "☼" : "◐"}
          </button>
          <button
            className="icon-action notification-action"
            type="button"
            aria-label="Open notifications"
            onClick={() =>
              toast({
                title: "You're all caught up",
                message: "New market activity will appear here.",
                tone: "success",
              })
            }
          >
            ◇<span aria-hidden="true" />
          </button>
          <WalletControl />
          <button
            className="menu-button"
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>

      <div className="shell-body">
        <aside className="side-rail" aria-label="Workspace navigation">
          <div>
            <span className="side-rail__label">Trade</span>
            {primaryNavigation.slice(0, 3).map((item) => (
              <Link
                className={isActive(pathname, item.href) ? "active" : ""}
                href={item.href}
                key={item.href}
              >
                <span aria-hidden="true">{item.label.slice(0, 1)}</span>
                {item.label}
              </Link>
            ))}
          </div>
          <div>
            <span className="side-rail__label">Build</span>
            <Link className={isActive(pathname, "/developers") ? "active" : ""} href="/developers">
              Developers
            </Link>
            {utilityNavigation.map((item) => (
              <Link
                className={isActive(pathname, item.href) ? "active" : ""}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="side-rail__footer">
            <StatusBadge tone="success">API operational</StatusBadge>
            <span>EventRail v0.1</span>
          </div>
        </aside>
        <main className="shell-main" key={pathname}>
          {children}
        </main>
      </div>

      <footer className="footer">
        <div>
          <Link className="brand footer-brand" href="/">
            <RailMark />
            <span>EventRail</span>
          </Link>
          <p>Prediction infrastructure that moves at the speed of events.</p>
        </div>
        <div className="footer-links">
          <Link href="/developers">Build with us</Link>
          <Link href="/status">Status</Link>
          <Link href="/settings">Settings</Link>
        </div>
      </footer>
      <nav className="mobile-tabs" aria-label="Mobile navigation">
        {primaryNavigation.map((item) => (
          <Link
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={isActive(pathname, item.href) ? "active" : ""}
            href={item.href}
            key={item.href}
          >
            {item.short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
