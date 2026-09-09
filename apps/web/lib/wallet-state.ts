export type WalletAction = "connect" | "switch" | "review";

export function getWalletAction(connected: boolean, correctNetwork: boolean): WalletAction {
  if (!connected) return "connect";
  if (!correctNetwork) return "switch";
  return "review";
}

export function classifyWalletError(message: string) {
  const rejected = /reject|denied|cancel/i.test(message);
  return {
    title: rejected ? "Connection cancelled" : "Wallet connection failed",
    message: rejected ? "No changes were made. Choose a wallet when you are ready." : message,
    tone: rejected ? ("info" as const) : ("error" as const),
  };
}
