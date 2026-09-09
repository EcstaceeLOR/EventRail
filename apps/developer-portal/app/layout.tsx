import type { ReactNode } from "react";
import Link from "next/link";
import "./style.css";
export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link className="brand" href="/developers">
            <span>ER</span> EventRail
          </Link>
          <nav>
            <Link href="/developers/quickstart">Quickstart</Link>
            <Link href="/developers/api">API</Link>
            <Link href="/developers/sdk">SDK</Link>
            <Link href="/developers/dashboard">Dashboard</Link>
          </nav>
          <Link className="console-link" href="/developers/settings">
            Console <b>↗</b>
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
