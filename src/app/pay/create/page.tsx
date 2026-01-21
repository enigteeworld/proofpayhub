"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function CreatePaymentRequestPage() {
  const [creatorAddress, setCreatorAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function createInvoice() {
    setMsg("");

    // Basic validation
    if (!creatorAddress.trim()) return setMsg("Please enter your wallet address.");
    if (!amount.trim() || Number(amount) <= 0) return setMsg("Please enter a valid amount.");

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("invoices")
        .insert([
          {
            creator_address: creatorAddress.trim(),
            amount: Number(amount),
            memo: memo.trim() || null,
            token_symbol: "USDT0",
            status: "open",
          },
        ])
        .select("id")
        .single();

      if (error) throw error;

      setMsg(`✅ Created! Payment link: /pay/${data.id}`);
      setAmount("");
      setMemo("");
    } catch (e: any) {
      setMsg(`❌ Error: ${e?.message ?? "Something went wrong"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Create Payment Request</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Create an invoice to request payment.
      </p>

      <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Your wallet address (payee)</span>
          <input
            value={creatorAddress}
            onChange={(e) => setCreatorAddress(e.target.value)}
            placeholder="0x..."
            style={inputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Amount (USDT0)</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10"
            inputMode="decimal"
            style={inputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Memo (optional)</span>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="e.g. Website design payment"
            style={inputStyle}
          />
        </label>

        <button
          onClick={createInvoice}
          disabled={loading}
          style={{
            ...btnStyle,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Creating..." : "Create payment request"}
        </button>

        {msg && (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(0,0,0,0.05)",
              whiteSpace: "pre-wrap",
            }}
          >
            {msg}
          </div>
        )}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "none",
  fontWeight: 700,
};

