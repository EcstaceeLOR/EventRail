"use client";

import { Button, Dialog, StatusBadge, useToast } from "@eventrail/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatEther } from "viem";
import { useBalance, useConnect, useConnection, useDisconnect, useSwitchChain } from "wagmi";
import { publicEnvironment, somniaShannon } from "../lib/wagmi";
import { classifyWalletError } from "../lib/wallet-state";

type WalletContextValue = {
  address: `0x${string}` | undefined;
  balance: string | undefined;
  connected: boolean;
  correctNetwork: boolean;
  openWallet: () => void;
  switchToShannon: () => void;
  switching: boolean;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const connection = useConnection();
  const connectState = useConnect();
  const disconnectState = useDisconnect();
  const switchState = useSwitchChain();
  const toast = useToast();
  const address = connection.address;
  const connected = connection.status === "connected";
  const correctNetwork = connection.chainId === somniaShannon.id;
  const balanceState = useBalance({
    address,
    chainId: somniaShannon.id,
    query: { enabled: Boolean(address) },
  });

  useEffect(() => {
    if (!connectState.error) return;
    toast(classifyWalletError(connectState.error.message));
  }, [connectState.error, toast]);

  useEffect(() => {
    if (switchState.error) {
      toast({ title: "Network switch failed", message: switchState.error.message, tone: "error" });
    }
  }, [switchState.error, toast]);

  const switchToShannon = useCallback(() => {
    switchState.switchChain({ chainId: somniaShannon.id });
  }, [switchState]);

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      balance: balanceState.data
        ? `${Number(formatEther(balanceState.data.value)).toFixed(3)} STT`
        : undefined,
      connected,
      correctNetwork,
      openWallet: () => setOpen(true),
      switchToShannon,
      switching: switchState.isPending,
    }),
    [address, balanceState.data, connected, correctNetwork, switchState.isPending, switchToShannon],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={connected ? "Wallet connected" : "Connect a wallet"}
        description={
          connected
            ? "Your wallet signs every transaction. EventRail never receives your private key."
            : "Choose an injected browser wallet or scan with a WalletConnect-compatible mobile wallet."
        }
      >
        {connected && address ? (
          <div className="wallet-panel">
            <div className="wallet-account-row">
              <span className="wallet-avatar" aria-hidden="true" />
              <div>
                <strong>{shortAddress(address)}</strong>
                <span>
                  {value.balance ?? (balanceState.isLoading ? "Loading balance…" : "Balance unavailable")}
                </span>
              </div>
              <StatusBadge tone={correctNetwork ? "success" : "warning"}>
                {correctNetwork ? "Shannon" : "Wrong network"}
              </StatusBadge>
            </div>
            {!correctNetwork ? (
              <Button loading={switchState.isPending} onClick={switchToShannon}>
                Switch to Somnia Shannon
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => {
                disconnectState.disconnect();
                setOpen(false);
              }}
            >
              Disconnect wallet
            </Button>
          </div>
        ) : (
          <div className="wallet-options">
            {connectState.connectors.map((connector) => (
              <Button
                key={connector.uid}
                variant="secondary"
                loading={connectState.isPending}
                onClick={() => connectState.connect({ connector }, { onSuccess: () => setOpen(false) })}
              >
                <span className="wallet-option-icon" aria-hidden="true">
                  {connector.name.slice(0, 1)}
                </span>
                <span>{connector.name}</span>
              </Button>
            ))}
            {!publicEnvironment.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ? (
              <p className="wallet-config-note">
                WalletConnect activates when <code>NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</code> is configured.
              </p>
            ) : null}
          </div>
        )}
      </Dialog>
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider.");
  return context;
}

export function WalletControl() {
  const wallet = useWallet();
  if (!wallet.connected || !wallet.address) {
    return (
      <Button className="wallet-control" onClick={wallet.openWallet}>
        Connect wallet
      </Button>
    );
  }
  if (!wallet.correctNetwork) {
    return (
      <Button
        className="wallet-control wallet-control--warning"
        variant="secondary"
        loading={wallet.switching}
        onClick={wallet.switchToShannon}
      >
        Switch network
      </Button>
    );
  }
  return (
    <Button className="wallet-control" variant="secondary" onClick={wallet.openWallet}>
      <span className="wallet-control__status" aria-hidden="true" />
      {shortAddress(wallet.address)}
      {wallet.balance ? <small>{wallet.balance}</small> : null}
    </Button>
  );
}
