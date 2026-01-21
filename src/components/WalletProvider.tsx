"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";

const flareTestnet = defineChain({
  id: 114,
  name: "Flare Testnet (Coston2)",
  nativeCurrency: { name: "Coston2 FLR", symbol: "C2FLR", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] },
  },
  blockExplorers: {
    default: { name: "Flare Explorer", url: "https://coston2-explorer.flare.network" },
  },
});

const config = getDefaultConfig({
  appName: "ProofPay Hub",
projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
 chains: [flareTestnet],
  ssr: true,
});

const queryClient = new QueryClient();

export default function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

