import { SomniaMarkets, ORDER_TYPE, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const INDEXER_URL = "https://dev.smk.somnia.host/v1/graphql";
const RPC_URL = "https://dream-rpc.somnia.network";
const WS_URL = "wss://api.infra.testnet.somnia.network/ws";
const privateKey = process.env.DREAMDEX_PRIVATE_KEY;
const liveWrite = process.env.DREAMDEX_LIVE_WRITE === "1";
const redeem = process.env.DREAMDEX_REDEEM === "1";

if ((liveWrite || redeem) && !/^0x[0-9a-fA-F]{64}$/.test(privateKey ?? "")) {
  throw new Error("Set DREAMDEX_PRIVATE_KEY to a funded Shannon-only key before enabling writes");
}
const signerAccount = privateKey ? privateKeyToAccount(privateKey) : undefined;

const exchange = new SomniaMarkets({
  indexerUrl: INDEXER_URL,
  chain: somniaShannon,
  wsRpcUrl: WS_URL,
  addresses: SOMNIA_TESTNET_ADDRESSES,
  ...(privateKey ? { privateKey } : {}),
});
const publicClient = createPublicClient({ chain: somniaShannon, transport: http(RPC_URL) });

const markets = await exchange.client.listLiveBinaryMarkets();
const candidates = await Promise.all(
  markets.slice(0, 32).map(async (market) => {
    try {
      const [book, onchain] = await Promise.all([
        exchange.client.getBinaryOrderBook(market.poolAddress, { depth: 5 }),
        exchange.client.getMarketOnchain(market.marketId),
      ]);
      return { market, book, onchain };
    } catch {
      return null;
    }
  }),
);
const selected =
  candidates.find(
    (candidate) =>
      candidate?.onchain.status === 1 &&
      (candidate.book.yesAsks.length > 0 || candidate.book.noAsks.length > 0),
  ) ?? candidates.find((candidate) => candidate?.onchain.status === 1);
if (!selected) throw new Error("No active Shannon binary market was found");

const block = await publicClient.getBlockNumber();
const result = {
  sdkVersion: "0.29.0",
  network: "shannon",
  chainId: somniaShannon.id,
  observedAt: new Date().toISOString(),
  sourceBlock: block.toString(),
  market: {
    id: selected.market.id,
    poolAddress: selected.market.poolAddress,
    question: selected.market.question,
    status: selected.market.status,
    expiry: selected.market.expiry,
    quoteDecimals: selected.market.quoteDecimals,
  },
  book: serializeBook(selected.book),
  onchain: serializeOnchain(selected.onchain),
  trade: { status: "not-requested" },
  redemption: { status: "not-requested" },
};

if (liveWrite) {
  if (!signerAccount) throw new Error("A Shannon signer is required for the live write");
  const gasBalance = await publicClient.getBalance({ address: signerAccount.address });
  if (gasBalance === 0n) {
    throw new Error(`Fund Shannon gas token STT for ${signerAccount.address} before enabling writes`);
  }
  const params = await exchange.client.getBinaryBookParams(selected.market.poolAddress);
  const oneBase = 10n ** BigInt(selected.market.quoteDecimals);
  const yesAsk = selected.book.yesAsks[0];
  const noAsk = selected.book.noAsks[0];
  const bestOffer = yesAsk ?? noAsk;
  if (!bestOffer) throw new Error("No executable YES or NO liquidity is currently available");
  const side = yesAsk ? "BUY_YES" : "BUY_NO";
  const yesTermsPrice = yesAsk ? yesAsk.price : oneBase - bestOffer.price;
  const requiredCollateral = (bestOffer.price * params.minQuantity + oneBase - 1n) / oneBase;
  const collateralBalance = await exchange.client.getErc20Balance(
    selected.onchain.collateral,
    signerAccount.address,
  );
  let faucetTransactionHash;
  if (collateralBalance < requiredCollateral) {
    const faucet = await exchange.trader.faucet({
      amount: 100n * oneBase,
      testUsdc: selected.onchain.collateral,
    });
    faucetTransactionHash = faucet.hash;
  }
  const trade = await exchange.trader.placeOrder({
    pool: selected.market.poolAddress,
    side,
    price: yesTermsPrice,
    quantity: params.minQuantity,
    orderType: ORDER_TYPE.MARKET,
    autoApprove: true,
  });
  result.trade = {
    status: "confirmed",
    side,
    ...(faucetTransactionHash ? { faucetTransactionHash } : {}),
    transactionHash: trade.hash,
    receiptStatus: trade.receipt.status,
    fills: trade.fills.map((fill) => ({
      makerOrderId: fill.makerOrderId.toString(),
      quantityFilled: fill.quantityFilled.toString(),
      fillPrice: fill.fillPrice.toString(),
    })),
  };
}

if (signerAccount) {
  const claimable = await exchange.client.getClaimable(signerAccount.address);
  result.redemption = {
    status: claimable.length > 0 ? "prepared" : "nothing-claimable",
    account: signerAccount.address,
    entries: claimable.map((entry) => ({
      marketId: entry.marketId,
      outcomeIdx: entry.outcomeIdx,
      amount: entry.amount.toString(),
    })),
  };
  if (redeem && claimable.length > 0) {
    const redemption = await exchange.trader.redeemMany({
      entries: claimable.map(({ marketId, outcomeIdx, amount }) => ({ marketId, outcomeIdx, amount })),
      autoApprove: true,
    });
    result.redemption = {
      ...result.redemption,
      status: "confirmed",
      transactionHash: redemption.hash,
      receiptStatus: redemption.receipt.status,
    };
  }
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(0);

function serializeBook(book) {
  return Object.fromEntries(
    Object.entries(book).map(([side, levels]) => [
      side,
      levels.map((level) => ({ price: level.price.toString(), quantity: level.quantity.toString() })),
    ]),
  );
}

function serializeOnchain(onchain) {
  return {
    ...onchain,
    yesId: onchain.yesId.toString(),
    noId: onchain.noId.toString(),
    nonce: onchain.nonce.toString(),
    backing: onchain.backing.toString(),
    expiry: onchain.expiry.toString(),
  };
}
