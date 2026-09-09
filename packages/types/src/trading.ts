import { z } from "zod";
import {
  AddressSchema,
  Bytes32Schema,
  IsoDateTimeSchema,
  MarketOutcomeSchema,
  SomniaNetworkSchema,
  UnsignedIntegerStringSchema,
} from "./data.js";

export const TradeQuoteSchema = z.object({
  version: z.literal("1"),
  network: SomniaNetworkSchema,
  venue: z.literal("dreamdex"),
  marketId: Bytes32Schema,
  poolAddress: AddressSchema,
  outcome: MarketOutcomeSchema,
  side: z.enum(["buy", "sell"]),
  mode: z.enum(["spend", "quantity"]),
  requestedAmount: UnsignedIntegerStringSchema,
  quantity: UnsignedIntegerStringSchema,
  availableQuantity: UnsignedIntegerStringSchema,
  minimumFillQuantity: UnsignedIntegerStringSchema,
  notional: UnsignedIntegerStringSchema,
  fee: UnsignedIntegerStringSchema,
  total: UnsignedIntegerStringSchema,
  averagePrice: UnsignedIntegerStringSchema,
  worstPrice: UnsignedIntegerStringSchema,
  limitPrice: UnsignedIntegerStringSchema,
  priceImpactBps: UnsignedIntegerStringSchema,
  spread: z
    .string()
    .regex(/^-?(0|[1-9][0-9]*)$/)
    .nullable(),
  tickSize: UnsignedIntegerStringSchema,
  lotSize: UnsignedIntegerStringSchema,
  sourceBlock: UnsignedIntegerStringSchema,
  observedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  marketExpiresAt: IsoDateTimeSchema,
  warnings: z.array(z.string()),
});

export type TradeQuote = z.infer<typeof TradeQuoteSchema>;
