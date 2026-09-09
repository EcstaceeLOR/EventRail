export const SOMNIA_NETWORKS = {
  shannon: {
    name: "Somnia Shannon Testnet",
    chainId: 50_312,
    chainIdHex: "0xc488",
    nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
    rpcUrl: "https://dream-rpc.somnia.network",
    wsUrl: "wss://api.infra.testnet.somnia.network/ws",
    explorerUrl: "https://shannon-explorer.somnia.network",
    dreamDexIndexerUrl: "https://dev.smk.somnia.host/v1/graphql",
    testnet: true,
  },
  mainnet: {
    name: "Somnia Mainnet",
    chainId: 5_031,
    chainIdHex: "0x13a7",
    nativeCurrency: { name: "Somnia", symbol: "SOMI", decimals: 18 },
    rpcUrl: "https://api.infra.mainnet.somnia.network",
    wsUrl: "wss://api.infra.mainnet.somnia.network/ws",
    explorerUrl: "https://explorer.somnia.network",
    dreamDexIndexerUrl: "https://prd.smk.somnia.host/v1/graphql",
    testnet: false,
  },
} as const;

export type SomniaNetworkName = keyof typeof SOMNIA_NETWORKS;
export type SomniaNetwork = (typeof SOMNIA_NETWORKS)[SomniaNetworkName];

export function getSomniaNetwork(name: SomniaNetworkName): SomniaNetwork {
  return SOMNIA_NETWORKS[name];
}
