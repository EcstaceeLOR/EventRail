import type { ReactNode } from "react";
export default function Layout({ children }: Readonly<{ children: ReactNode }>) { return <html lang="en"><body style={{margin:0,background:"#07110f",color:"#effff8",fontFamily:"system-ui"}}>{children}</body></html>; }
