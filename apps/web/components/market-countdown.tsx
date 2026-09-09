"use client";

import { useEffect, useState } from "react";

export function MarketCountdown({ expiresAt }: Readonly<{ expiresAt: string }>) {
  const [remaining, setRemaining] = useState("—");
  useEffect(() => {
    const update = () => setRemaining(remainingTime(expiresAt));
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return <time dateTime={expiresAt}>{remaining}</time>;
}

function remainingTime(expiresAt: string) {
  const seconds = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1_000));
  if (seconds === 0) return "Locked";
  const days = Math.floor(seconds / 86_400);
  if (days > 0) return `${days}d ${Math.floor((seconds % 86_400) / 3_600)}h`;
  const hours = Math.floor(seconds / 3_600);
  if (hours > 0) return `${hours}h ${Math.floor((seconds % 3_600) / 60)}m`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
