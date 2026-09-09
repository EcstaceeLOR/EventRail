import { z } from "zod";
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const httpsUrl = z.url().refine((value) => value.startsWith("https://"), "must use HTTPS");
export const EmbedThemeSchema = z.object({
  surface: color,
  surfaceRaised: color,
  text: color,
  muted: color,
  accent: color,
  positive: color,
  negative: color,
  radius: z.enum(["compact", "soft", "round"]),
});
export const EmbedConfigSchema = z.object({
  version: z.literal("1"),
  name: z.string().min(2).max(80),
  logoUrl: httpsUrl.nullable().default(null),
  theme: EmbedThemeSchema,
  allowedAssets: z
    .array(z.string().regex(/^[A-Z0-9]{2,12}$/))
    .min(1)
    .max(20),
  allowedCadences: z.array(z.number().int().min(60).max(86_400)).min(1).max(12),
  defaultSpend: z.string().regex(/^[1-9][0-9]*$/),
  risk: z.object({
    maxSpend: z.string().regex(/^[1-9][0-9]*$/),
    maxSlippageBps: z.number().int().min(10).max(2_000),
    minimumFillBps: z.number().int().min(5_000).max(10_000),
    minimumTimeRemainingSeconds: z.number().int().min(15).max(3_600),
  }),
  callbacks: z.object({ onTradePrepared: z.boolean(), onTransactionSubmitted: z.boolean() }),
});
export type EmbedTheme = z.infer<typeof EmbedThemeSchema>;
export type EmbedConfig = z.infer<typeof EmbedConfigSchema>;
export const EVENTRAIL_THEMES = {
  midnight: {
    surface: "#07110f",
    surfaceRaised: "#10211d",
    text: "#effff8",
    muted: "#8ca9a1",
    accent: "#74fbc0",
    positive: "#49dc97",
    negative: "#ff747f",
    radius: "soft",
  },
  paper: {
    surface: "#f3f0e8",
    surfaceRaised: "#ffffff",
    text: "#17201d",
    muted: "#64716c",
    accent: "#087f5b",
    positive: "#087f5b",
    negative: "#c92a2a",
    radius: "compact",
  },
  signal: {
    surface: "#0b1020",
    surfaceRaised: "#121b34",
    text: "#f2f5ff",
    muted: "#91a0c4",
    accent: "#8ba5ff",
    positive: "#42e3b4",
    negative: "#ff7eaa",
    radius: "round",
  },
} as const satisfies Record<string, EmbedTheme>;
export function validateEmbedConfig(input: unknown): EmbedConfig {
  const config = EmbedConfigSchema.parse(input);
  if (BigInt(config.defaultSpend) > BigInt(config.risk.maxSpend))
    throw new TypeError("Default spend cannot exceed the mandatory maximum spend.");
  return config;
}
