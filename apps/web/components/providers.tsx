"use client";

import { EventRailClient } from "@eventrail/api-client";
import { EventRailProvider, ToastProvider } from "@eventrail/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "../lib/wagmi";
import { browserGatewayUrl } from "../lib/gateway-routing";
import { gatewayRetryDelay, offlineRecoveryInterval, shouldRetryGatewayQuery } from "../lib/query-recovery";
import { WalletProvider } from "./wallet-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: shouldRetryGatewayQuery,
            retryDelay: gatewayRetryDelay,
            refetchInterval: offlineRecoveryInterval,
            refetchIntervalInBackground: true,
            refetchOnReconnect: "always",
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  const [eventRailClient] = useState(() => new EventRailClient({ baseUrl: browserGatewayUrl }));
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
