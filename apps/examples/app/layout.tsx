import type { ReactNode } from "react";
import "@eventrail/react/styles.css";
import "./style.css";
export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
