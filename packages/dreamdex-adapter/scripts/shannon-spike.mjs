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
  markets.slice(0, 12).map(async (market) => {
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
const selected = candidates.find(
  (candidate) => candidate?.onchain.status === 1 && candidate.book.yesAsks.length > 0,
);
if (!selected) throw new Error("No live Shannon binary market with YES-side liquidity was found");

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
  const params = await exchange.client.getBinaryBookParams(selected.market.poolAddress);
  const bestAsk = selected.book.yesAsks[0];
  if (!bestAsk) throw new Error("Selected market lost its YES ask before placement");
  const trade = await exchange.trader.placeOrder({
    pool: selected.market.poolAddress,
    side: "BUY_YES",
    price: bestAsk.price,
    quantity: params.minQuantity,
    orderType: ORDER_TYPE.MARKET,
    autoApprove: true,
  });
  result.trade = {
    status: "confirmed",
    transactionHash: trade.hash,
    receiptStatus: trade.receipt.status,
    fills: trade.fills.map((fill) => ({
      makerOrderId: fill.makerOrderId.toString(),
      quantityFilled: fill.quantityFilled.toString(),
      fillPrice: fill.fillPrice.toString(),
    })),
  };
}

if (privateKey) {
  const account = privateKeyToAccount(privateKey);
  const claimable = await exchange.client.getClaimable(account.address);
  result.redemption = {
    status: claimable.length > 0 ? "prepared" : "nothing-claimable",
    account: account.address,
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
