"use client";

import { ToastProvider } from "@eventrail/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "../lib/wagmi";
import { WalletProvider } from "./wallet-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WalletProvider>{children}</WalletProvider>
        </ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
