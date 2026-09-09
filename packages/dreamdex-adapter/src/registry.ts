import {
  SOMNIA_MAINNET_ADDRESSES,
  SOMNIA_TESTNET_ADDRESSES,
  type MarketOnchain,
  type SomniaMarketsAddresses,
} from "@somnia-chain/markets-sdk";
import { somniaMainnet, somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { createPublicClient, erc20Abi, http, type Address, type Chain, type Hex } from "viem";
import type { SomniaNetwork } from "@eventrail/types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface DreamDexContractRegistry {
  network: SomniaNetwork;
  chain: Chain;
  chainId: number;
  indexerUrl: string;
  rpcUrls: readonly [string, ...string[]];
  wsUrls: readonly [string, ...string[]];
  addresses: SomniaMarketsAddresses;
}

export interface ValidatedDreamDexRegistry extends DreamDexContractRegistry {
  collateralAddress: Address;
  collateralDecimals: number;
  validatedAt: string;
}

export interface RegistryReader {
  getChainId(): Promise<number>;
  getBytecode(address: Address): Promise<Hex | undefined>;
  readCollateralDecimals(address: Address): Promise<number>;
}

export interface MarketBindingReader {
  getMarketOnchain(marketId: Hex): Promise<MarketOnchain>;
  getBlockNumber(): Promise<bigint>;
}

export interface ResolvedMarketBinding {
  marketId: Hex;
  marketAddress: Address;
  poolAddress: Address;
  poolNonce: bigint;
  collateralAddress: Address;
  collateralDecimals: number;
  outcomeTokenAddress: Address;
  upTokenId: bigint;
  downTokenId: bigint;
  sourceBlock: bigint;
  status: number;
  expiry: bigint;
  backing: bigint;
  finalized: boolean;
  winningOutcome: number;
  isResolved: boolean;
  isVoided: boolean;
}

export class RegistryValidationError extends Error {
  readonly code:
    "CHAIN_MISMATCH" | "MISSING_ADDRESS" | "NO_BYTECODE" | "INVALID_DECIMALS" | "INVALID_MARKET_BINDING";

  constructor(code: RegistryValidationError["code"], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RegistryValidationError";
    this.code = code;
  }
}

const REGISTRIES: Record<SomniaNetwork, DreamDexContractRegistry> = {
  shannon: {
    network: "shannon",
    chain: somniaShannon,
    chainId: 50_312,
    indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
    rpcUrls: ["https://api.infra.testnet.somnia.network", "https://dream-rpc.somnia.network"],
    wsUrls: ["wss://api.infra.testnet.somnia.network/ws", "wss://dream-rpc.somnia.network/ws"],
    addresses: SOMNIA_TESTNET_ADDRESSES,
  },
  mainnet: {
    network: "mainnet",
    chain: somniaMainnet,
    chainId: 5_031,
    indexerUrl: "https://prd.smk.somnia.host/v1/graphql",
    rpcUrls: ["https://api.infra.mainnet.somnia.network"],
    wsUrls: ["wss://api.infra.mainnet.somnia.network/ws"],
    addresses: SOMNIA_MAINNET_ADDRESSES,
  },
};

export function getDreamDexRegistry(network: SomniaNetwork): DreamDexContractRegistry {
  return REGISTRIES[network];
}

export function createRegistryReader(registry: DreamDexContractRegistry): RegistryReader {
  const client = createPublicClient({ chain: registry.chain, transport: http(registry.rpcUrls[0]) });
  return {
    getChainId: () => client.getChainId(),
    getBytecode: (address) => client.getBytecode({ address }),
    readCollateralDecimals: async (address) =>
      Number(await client.readContract({ address, abi: erc20Abi, functionName: "decimals" })),
  };
}

export async function validateDreamDexRegistry(
  registry: DreamDexContractRegistry,
  reader: RegistryReader = createRegistryReader(registry),
): Promise<ValidatedDreamDexRegistry> {
  const chainId = await reader.getChainId();
  if (chainId !== registry.chainId) {
    throw new RegistryValidationError(
      "CHAIN_MISMATCH",
      `DreamDEX ${registry.network} RPC returned chain ${chainId}; expected ${registry.chainId}`,
    );
  }

  const required = [
    "binaryModule",
    "binarySettlement",
    "marketCreator",
    "marketsCore",
    "collateral",
  ] as const;
  for (const name of required) {
    const address = registry.addresses[name];
    if (!address || isZeroAddress(address)) {
      throw new RegistryValidationError(
        "MISSING_ADDRESS",
        `DreamDEX ${registry.network} registry has no ${name}`,
      );
    }
    const bytecode = await reader.getBytecode(address);
    if (!bytecode || bytecode === "0x") {
      throw new RegistryValidationError(
        "NO_BYTECODE",
        `DreamDEX ${registry.network} ${name} has no bytecode at ${address}`,
      );
    }
  }

  const collateralAddress = registry.addresses.collateral;
  if (!collateralAddress) {
    throw new RegistryValidationError("MISSING_ADDRESS", "DreamDEX collateral is not configured");
  }
  const collateralDecimals = await reader.readCollateralDecimals(collateralAddress);
  if (!Number.isInteger(collateralDecimals) || collateralDecimals < 0 || collateralDecimals > 36) {
    throw new RegistryValidationError(
      "INVALID_DECIMALS",
      `DreamDEX collateral returned invalid decimals: ${collateralDecimals}`,
    );
  }

  return { ...registry, collateralAddress, collateralDecimals, validatedAt: new Date().toISOString() };
}

export async function resolveMarketBinding(
  marketId: Hex,
  reader: MarketBindingReader,
): Promise<ResolvedMarketBinding> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(marketId)) {
    throw new RegistryValidationError("INVALID_MARKET_BINDING", `Invalid DreamDEX marketId: ${marketId}`);
  }
  const [market, sourceBlock] = await Promise.all([
    reader.getMarketOnchain(marketId),
    reader.getBlockNumber(),
  ]);
  if (
    isZeroAddress(market.marketAddress) ||
    isZeroAddress(market.pool) ||
    isZeroAddress(market.collateral) ||
    isZeroAddress(market.outcomeToken) ||
    !Number.isInteger(market.decimals) ||
    market.decimals < 0 ||
    market.decimals > 36
  ) {
    throw new RegistryValidationError(
      "INVALID_MARKET_BINDING",
      `Market ${marketId} returned an invalid pool binding`,
    );
  }
  return {
    marketId,
    marketAddress: market.marketAddress,
    poolAddress: market.pool,
    poolNonce: market.nonce,
    collateralAddress: market.collateral,
    collateralDecimals: market.decimals,
    outcomeTokenAddress: market.outcomeToken,
    upTokenId: market.yesId,
    downTokenId: market.noId,
    sourceBlock,
    status: market.status,
    expiry: market.expiry,
    backing: market.backing,
    finalized: market.finalized,
    winningOutcome: market.winningOutcome,
    isResolved: market.isResolved,
    isVoided: market.isVoided,
  };
}

function isZeroAddress(address: Address): boolean {
  return address.toLowerCase() === ZERO_ADDRESS;
}
