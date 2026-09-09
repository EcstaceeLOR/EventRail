import { SOMNIA_NETWORKS } from "@eventrail/config";
import { loadPublicEnvironment } from "@eventrail/config/public";
import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";

export const publicEnvironment = loadPublicEnvironment({
  NEXT_PUBLIC_SOMNIA_CHAIN_ID: process.env.NEXT_PUBLIC_SOMNIA_CHAIN_ID,
  NEXT_PUBLIC_SOMNIA_RPC_URL: process.env.NEXT_PUBLIC_SOMNIA_RPC_URL,
  NEXT_PUBLIC_GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL,
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
});

const shannon = SOMNIA_NETWORKS.shannon;

export const somniaShannon = defineChain({
  id: shannon.chainId,
  name: shannon.name,
  nativeCurrency: shannon.nativeCurrency,
  rpcUrls: {
    default: { http: [publicEnvironment.NEXT_PUBLIC_SOMNIA_RPC_URL], webSocket: [shannon.wsUrl] },
  },
  blockExplorers: { default: { name: "Somnia Explorer", url: shannon.explorerUrl } },
  testnet: true,
});

const projectId = publicEnvironment.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const connectors = [
  injected({ shimDisconnect: true }),
  ...(projectId
    ? [
        walletConnect({
          projectId,
          showQrModal: true,
          metadata: {
            name: "EventRail",
            description: "Trade DreamDEX Event Contracts on Somnia",
            url: "https://eventrail.xyz",
            icons: [],
          },
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [somniaShannon],
  connectors,
  transports: { [somniaShannon.id]: http(publicEnvironment.NEXT_PUBLIC_SOMNIA_RPC_URL) },
  ssr: true,
});
