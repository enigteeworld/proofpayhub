import type { Metadata } from "next";
import "./globals.css";
import WalletProvider from "@/components/WalletProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "ProofPay Hub",
  description: "Shareable payment proofs anchored on Flare testnet",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <WalletProvider>
            <Navbar />
            <div className="page">{children}</div>
            <Footer />
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

