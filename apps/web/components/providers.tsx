"use client";

import { EventRailClient } from "@eventrail/api-client";
import { EventRailProvider, ToastProvider } from "@eventrail/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "../lib/wagmi";
import { publicEnvironment } from "../lib/wagmi";
import { WalletProvider } from "./wallet-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [eventRailClient] = useState(
    () => new EventRailClient({ baseUrl: publicEnvironment.NEXT_PUBLIC_GATEWAY_URL }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <EventRailProvider client={eventRailClient}>
          <ToastProvider>
            <WalletProvider>{children}</WalletProvider>
          </ToastProvider>
        </EventRailProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
