"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { encodeFunctionData, parseEther, parseUnits } from "viem";
import {
  useAccount,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useChainId,
} from "wagmi";

type Invoice = {
  id: string;
  creator_address: string;
  amount: number;
  token_symbol: string;
  memo: string | null;
  status: string;
  created_at: string;
};

const FLARE_TESTNET_CHAIN_ID = 114;

// USDT0 (Coston2) from env so you can change later without editing code
const USDT0_ADDRESS = (process.env.NEXT_PUBLIC_USDT0_ADDRESS || "") as `0x${string}`;

// Minimal ERC-20 ABI for transfer
const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function prettyJson(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/**
 * ProofRails middleware responses can be wrapped in many shapes, e.g:
 * - { receipt_id: "..." }
 * - { receipt: { receipt_id: "..." } }
 * - { ok: true, receipt: { receipt_id: "..." } }
 * - { data: { receipt_id: "..." } }
 * This extracts from ALL likely shapes.
 */
function extractReceiptId(anyResp: any): string | null {
  const candidates: any[] = [
    anyResp,
    anyResp?.receipt,
    anyResp?.data,
    anyResp?.result,
    anyResp?.payload,
    anyResp?.response,
    anyResp?.body,
    anyResp?.json,
    anyResp?.receipt?.receipt,
    anyResp?.data?.receipt,
    anyResp?.result?.receipt,
  ];

  for (const c of candidates) {
    const rid = c?.receipt_id ?? c?.receiptId ?? c?.rid ?? c?.id ?? c?.receiptID ?? null;

    if (typeof rid === "string" && rid.trim().length > 0) return rid.trim();
  }

  return null;
}

function extractReceiptStatus(anyResp: any): string | null {
  const candidates: any[] = [
    anyResp,
    anyResp?.receipt,
    anyResp?.data,
    anyResp?.result,
    anyResp?.payload,
    anyResp?.response,
    anyResp?.body,
    anyResp?.json,
    anyResp?.data?.receipt,
    anyResp?.result?.receipt,
  ];

  for (const c of candidates) {
    const st = c?.status ?? c?.receipt_status ?? c?.state ?? null;
    if (typeof st === "string" && st.trim().length > 0) return st.trim();
  }

  return null;
}

/* ===================== BOUNTY-FRIENDLY UX FLOW ===================== */

type PostPayStep = "idle" | "saving" | "generating_receipt" | "anchoring" | "ready" | "error";

async function pollReceiptUntilAnchored(receiptId: string, timeoutMs = 90_000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const r = await fetch(`/api/proofrails/receipt/${receiptId}`, { cache: "no-store" });
    const data = await r.json().catch(() => null);

    const status =
      data?.receipt?.status ||
      data?.receipt?.state ||
      data?.receipt?.receipt_status ||
      data?.status ||
      "";

    if (String(status).toLowerCase() === "anchored") return data;

    await new Promise((res) => setTimeout(res, 2000));
  }

  throw new Error("Timed out waiting for anchoring.");
}

function StepRow({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  const icon = done ? "✅" : active ? "⏳" : "•";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 22, textAlign: "center" }}>{icon}</div>
      <div style={{ fontWeight: 900 }}>{label}</div>
      {active && <div style={{ marginLeft: "auto", opacity: 0.7 }}>Working…</div>}
    </div>
  );
}

export default function PayInvoicePage() {
  const params = useParams<{ invoiceId: string }>();
  const invoiceId = useMemo(() => params?.invoiceId, [params]);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  const [msg, setMsg] = useState("");
  const [debug, setDebug] = useState<string>(""); // ProofRails debug output
  const [sending, setSending] = useState(false);

  const [pendingTxHash, setPendingTxHash] = useState<`0x${string}` | null>(null);
  const [saved, setSaved] = useState(false);

  // For native C2FLR test payment
  const [nativeAmount, setNativeAmount] = useState("0.01");

  // Tracks what we are paying with so we save correctly after confirmation
  const [payMode, setPayMode] = useState<"C2FLR" | "USDT0">("C2FLR");
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paidSymbol, setPaidSymbol] = useState<string>("C2FLR");

  // ✅ New: post-payment UX state
  const [postPayStep, setPostPayStep] = useState<PostPayStep>("idle");
  const [postPayDetail, setPostPayDetail] = useState<string>("");
  const [proofSlug, setProofSlug] = useState<string>("");
  const [proofrailsReceiptId, setProofrailsReceiptId] = useState<string>("");

  const receipt = useWaitForTransactionReceipt({
    hash: pendingTxHash ?? undefined,
  });

  useEffect(() => {
    async function loadInvoice() {
      setMsg("");
      setDebug("");
      setLoading(true);

      try {
        const { data, error } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();

        if (error) throw error;
        setInvoice(data);
      } catch (e: any) {
        setMsg(`❌ Could not load invoice: ${e?.message ?? "Unknown error"}`);
      } finally {
        setLoading(false);
      }
    }

    if (invoiceId) loadInvoice();
  }, [invoiceId]);

  async function ensureFlareTestnet() {
    if (chainId === FLARE_TESTNET_CHAIN_ID) return;
    setMsg("Switching network to Flare Testnet (Coston2)...");
    await switchChainAsync({ chainId: FLARE_TESTNET_CHAIN_ID });
  }

  async function payWithNativeToken() {
    setMsg("");
    setDebug("");
    setPostPayStep("idle");
    setPostPayDetail("");
    setProofSlug("");
    setProofrailsReceiptId("");

    if (!invoice) return;
    if (!isConnected || !address) return setMsg("Please connect your wallet first.");
    if (invoice.status === "paid") return setMsg("This invoice is already marked as paid.");

    if (!nativeAmount.trim() || Number(nativeAmount) <= 0) {
      return setMsg("Enter a valid C2FLR amount (e.g. 0.01).");
    }

    const to = invoice.creator_address?.trim();
    if (!to || !to.startsWith("0x")) return setMsg("Invoice payee address looks invalid.");

    setSending(true);
    setSaved(false);

    try {
      await ensureFlareTestnet();

      setMsg("Sending C2FLR transaction in MetaMask...");

      setPayMode("C2FLR");
      setPaidSymbol("C2FLR");
      setPaidAmount(Number(nativeAmount));

      const txHash = await sendTransactionAsync({
        to: to as `0x${string}`,
        value: parseEther(nativeAmount),
      });

      setPendingTxHash(txHash);
      setMsg(`✅ Transaction sent!\nTx hash:\n${txHash}\n\nWaiting for confirmation...`);
    } catch (e: any) {
      setMsg(`❌ Transaction failed: ${e?.shortMessage ?? e?.message ?? "Unknown error"}`);
      setPendingTxHash(null);
    } finally {
      setSending(false);
    }
  }

  async function payWithUSDT0() {
    setMsg("");
    setDebug("");
    setPostPayStep("idle");
    setPostPayDetail("");
    setProofSlug("");
    setProofrailsReceiptId("");

    if (!invoice) return;
    if (!isConnected || !address) return setMsg("Please connect your wallet first.");
    if (invoice.status === "paid") return setMsg("This invoice is already marked as paid.");

    const to = invoice.creator_address?.trim();
    if (!to || !to.startsWith("0x")) return setMsg("Invoice payee address looks invalid.");

    if (!USDT0_ADDRESS || !USDT0_ADDRESS.startsWith("0x")) {
      return setMsg(`USDT0 contract address missing.\nAdd NEXT_PUBLIC_USDT0_ADDRESS in .env.local and restart.`);
    }

    const usdt0Amount = invoice.amount;
    if (!usdt0Amount || usdt0Amount <= 0) return setMsg("Invoice amount is invalid.");

    setSending(true);
    setSaved(false);

    try {
      await ensureFlareTestnet();

      setMsg("Sending USDT0 transfer in MetaMask...");

      setPayMode("USDT0");
      setPaidSymbol("USDT0");
      setPaidAmount(Number(usdt0Amount));

      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [to as `0x${string}`, parseUnits(String(usdt0Amount), 18)],
      });

      const txHash = await sendTransactionAsync({
        to: USDT0_ADDRESS,
        data,
        value: BigInt(0),

      });

      setPendingTxHash(txHash);
      setMsg(`✅ USDT0 transfer sent!\nTx hash:\n${txHash}\n\nWaiting for confirmation...`);
    } catch (e: any) {
      setMsg(`❌ USDT0 transfer failed: ${e?.shortMessage ?? e?.message ?? "Unknown error"}`);
      setPendingTxHash(null);
    } finally {
      setSending(false);
    }
  }

  // Calls our Next.js server route which calls the ProofRails middleware securely
  async function createProofRailsReceipt(tip: {
    chain: string;
    tx_hash: string;
    amount: string;
    currency: string;
    sender: string;
    receiver: string;
    reference?: string;
  }) {
    const res = await fetch("/api/proofrails/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tip }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const statusLine = `HTTP ${res.status} ${res.statusText || ""}`.trim();
      const details = data?.error || data?.detail || "ProofRails create failed";
      const raw = data?.raw ?? data;

      const debugText = [
        "PROOFRAILS CREATE FAILED",
        statusLine,
        "",
        "Message:",
        String(details),
        "",
        "Raw response:",
        prettyJson(raw),
      ].join("\n");

      const err: any = new Error(details);
      err.__debug = debugText;
      throw err;
    }

    return data;
  }

  // Save on confirmation (both C2FLR and USDT0)
  useEffect(() => {
    async function saveOnConfirm() {
      if (!invoice) return;
      if (!address) return;
      if (!pendingTxHash) return;
      if (saved) return;

      // Wait for confirmation success
      if (receipt.status !== "success" || !receipt.data) return;

      try {
        setDebug("");

        // ✅ Step 1: Saving
        setPostPayStep("saving");
        setPostPayDetail("Saving payment + creating proof link…");

        // 1) Save payment
        const { data: paymentRow, error: payErr } = await supabase
          .from("payments")
          .insert([
            {
              invoice_id: invoice.id,
              payer_address: address,
              payee_address: invoice.creator_address,
              chain_id: FLARE_TESTNET_CHAIN_ID,
              tx_hash: pendingTxHash,
              amount: paidAmount,
              token_symbol: paidSymbol,
            },
          ])
          .select("id")
          .single();

        if (payErr) throw payErr;

        // 2) Mark invoice paid
        const { error: invErr } = await supabase.from("invoices").update({ status: "paid" }).eq("id", invoice.id);

        if (invErr) throw invErr;

        // 3) Create proof + share slug
        const shareSlug = `proof_${crypto.randomUUID()}`;

        const { data: proofRow, error: proofErr } = await supabase
          .from("proofs")
          .insert([
            {
              payment_id: paymentRow.id,
              public_slug: shareSlug,
              anchored_on_flare: false,
            },
          ])
          .select("id, public_slug")
          .single();

        if (proofErr) throw proofErr;

        // ✅ expose proof slug for UX
        setProofSlug(proofRow.public_slug);

        // ✅ Step 2: Generating receipt
        setPostPayStep("generating_receipt");
        setPostPayDetail("Generating ProofRails receipt…");

        // 4) Create ProofRails receipt (do NOT block payment success)
        let prReceiptId: string | null = null;
        let prStatus: string = "pending";

        try {
          const pr = await createProofRailsReceipt({
            chain: "coston2",
            tx_hash: pendingTxHash,
            amount: String(paidAmount),
            currency: paidSymbol,
            sender: address,
            receiver: invoice.creator_address,
            reference: invoice.id,
          });

          prReceiptId = extractReceiptId(pr);
          prStatus = extractReceiptStatus(pr) ?? "pending";

          if (!prReceiptId) {
            const dbg = ["PROOFRAILS RESPONSE HAD NO RECEIPT ID", "", "Raw response:", prettyJson(pr)].join("\n");
            setDebug(dbg);
          } else {
            setProofrailsReceiptId(prReceiptId);

            const upd = await supabase
              .from("proofs")
              .update({
                proofrails_receipt_id: prReceiptId,
                proofrails_status: prStatus,
              })
              .eq("id", proofRow.id);

            if (upd.error) {
              setDebug(
                [
                  "FAILED TO SAVE PROOFRAILS RECEIPT TO SUPABASE",
                  "",
                  `Supabase error: ${upd.error.message}`,
                  "",
                  `receipt_id: ${prReceiptId}`,
                  `status: ${prStatus}`,
                ].join("\n")
              );
            }
          }
        } catch (e: any) {
          setDebug(e?.__debug ? String(e.__debug) : `PROOFRAILS ERROR\n${e?.message ?? "Unknown error"}`);
        }

        // ✅ Step 3: Anchoring (middleware background)
        if (prReceiptId) {
          setPostPayStep("anchoring");
          setPostPayDetail("Anchoring on Flare…");

          try {
            await pollReceiptUntilAnchored(prReceiptId);
          } catch {
            // Don't fail the whole UX if anchoring is slow
          }
        }

        // ✅ Step 4: Ready
        setPostPayStep("ready");
        setPostPayDetail("Receipt ready ✅");

        setSaved(true);
        setInvoice({ ...invoice, status: "paid" });

        const lines: string[] = [];
        lines.push("✅ Payment confirmed + saved!");
        lines.push(`Tx:\n${pendingTxHash}`);
        lines.push(`Shareable proof link:\n/proof/${proofRow.public_slug}`);
        if (prReceiptId) lines.push(`ProofRails receipt:\n${prReceiptId}`);
        lines.push("");
        lines.push("You can now view or download the receipt.");

        setMsg(lines.join("\n"));
      } catch (e: any) {
        setPostPayStep("error");
        setPostPayDetail(e?.message ?? "Unknown error");
        setMsg(`❌ Save failed: ${e?.message ?? "Unknown error"}`);
      }
    }

    saveOnConfirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.status, receipt.data, invoice, address, pendingTxHash, paidAmount, paidSymbol, saved]);

  if (loading) {
    return (
      <main className="container" style={{ position: "relative" }}>
        <div aria-hidden style={bgWash} />
        <section className="hero">
          {/* ✅ Single column: remove squeezed right tab */}
          <div className="heroGrid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="panel heroMain">
              <div className="badgePill">Loading invoice...</div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!invoice) {
    return (
      <main className="container" style={{ position: "relative" }}>
        <div aria-hidden style={bgWash} />
        <section className="hero">
          {/* ✅ Single column: remove squeezed right tab */}
          <div className="heroGrid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="panel heroMain">
              <div className="kicker">
                <span className="dot" />
                Invoice
              </div>
              <h1 className="h1">Invoice not found</h1>
              {msg && (
                <div className="badgePill" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
                  {msg}
                </div>
              )}
              <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: "wrap" }}>
                <Link className="btn btn-primary" href="/pay/create">
                  Create a new invoice
                </Link>
                <Link className="btn" href="/">
                  Back home
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const confirmText =
    receipt.isLoading
      ? "Waiting..."
      : receipt.status === "success"
      ? "Confirmed ✅"
      : receipt.status === "error"
      ? "Failed ❌"
      : "—";

  return (
    <main className="container" style={{ position: "relative" }}>
      <div aria-hidden style={bgWash} />

      <section className="hero">
        {/* ✅ Single column so left gets full width */}
        <div className="heroGrid" style={{ gridTemplateColumns: "1fr" }}>
          <div className="panel heroMain" style={{ width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="kicker">
                  <span className="dot" />
                  Pay invoice
                </div>
                <h1 className="h1" style={{ marginTop: 10 }}>
                  Complete payment
                </h1>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ConnectButton />
              </div>
            </div>

            <p className="lead" style={{ marginTop: 10 }}>
              Connect your wallet, confirm the transaction, and get a proof link you can share. ProofRails will
              generate a receipt and evidence bundle.
            </p>

            {/* Key values */}
            <div className="kv" style={{ marginTop: 14 }}>
              <div className="kvItem">
                <div className="kvKey">Invoice amount</div>
                <div className="kvVal">
                  {invoice.amount} {invoice.token_symbol}
                </div>
              </div>

              <div className="kvItem">
                <div className="kvKey">Payee</div>
                <div className="kvVal" style={wrapLong}>
                  {invoice.creator_address}
                </div>
              </div>

              <div className="kvItem">
                <div className="kvKey">Status</div>
                <div className="kvVal">{invoice.status}</div>
              </div>

              <div className="kvItem">
                <div className="kvKey">Memo</div>
                <div className="kvVal" style={wrapLong}>
                  {invoice.memo ?? "—"}
                </div>
              </div>

              <div className="kvItem">
                <div className="kvKey">Your wallet</div>
                <div className="kvVal" style={wrapLong}>
                  {isConnected ? address : "Not connected"}
                </div>
              </div>
            </div>

            <div className="hr" style={{ marginTop: 18, marginBottom: 18 }} />

            {/* Options */}
            <div style={{ display: "grid", gap: 18 }}>
              {/* ✅ Responsive grid so cards never squeeze / cut off values */}
              <div
                className="grid3"
                style={{
                  gap: 18,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  alignItems: "stretch",
                }}
              >
                {/* Option A */}
                <div className="card" style={{ padding: 16, height: "auto", overflow: "visible" }}>
                  <div className="cardTitle">Option A: Pay with C2FLR</div>
                  <div className="cardText" style={{ marginTop: 8 }}>
                    Sends native C2FLR directly to the payee. Ideal for testing the full proof flow.
                  </div>

                  <div className="field" style={{ marginTop: 12 }}>
                    <div className="label">C2FLR amount</div>
                    <input
                      value={nativeAmount}
                      onChange={(e) => setNativeAmount(e.target.value)}
                      placeholder="0.01"
                      inputMode="decimal"
                      className="input"
                      disabled={invoice.status === "paid"}
                    />
                  </div>

                  <button
                    onClick={payWithNativeToken}
                    disabled={!isConnected || sending || invoice.status === "paid"}
                    className="btn btn-primary"
                    style={{
                      marginTop: 12,
                      width: "100%",
                      opacity: !isConnected || sending || invoice.status === "paid" ? 0.65 : 1,
                      cursor: !isConnected || sending || invoice.status === "paid" ? "not-allowed" : "pointer",
                    }}
                  >
                    {invoice.status === "paid"
                      ? "Already paid"
                      : !isConnected
                      ? "Connect wallet to pay"
                      : sending && payMode === "C2FLR"
                      ? "Sending..."
                      : "Pay now (C2FLR)"}
                  </button>
                </div>

                {/* Option B */}
                <div className="card" style={{ padding: 16, height: "auto", overflow: "visible" }}>
                  <div className="cardTitle">Option B: Pay with USDT0</div>
                  <div className="cardText" style={{ marginTop: 8 }}>
                    Calls the USDT0 contract and executes <b>transfer(payee, amount)</b>.
                  </div>

                  

                  <button
                    onClick={payWithUSDT0}
                    disabled={!isConnected || sending || invoice.status === "paid"}
                    className="btn"
                    style={{
                      marginTop: 12,
                      width: "100%",
                      opacity: !isConnected || sending || invoice.status === "paid" ? 0.65 : 1,
                      cursor: !isConnected || sending || invoice.status === "paid" ? "not-allowed" : "pointer",
                    }}
                  >
                    {invoice.status === "paid"
                      ? "Already paid"
                      : !isConnected
                      ? "Connect wallet to pay"
                      : sending && payMode === "USDT0"
                      ? "Sending..."
                      : `Pay invoice amount (${invoice.amount} USDT0)`}
                  </button>
                </div>

                {/* Status */}
                <div className="card" style={{ padding: 16, height: "auto", overflow: "visible" }}>
                  <div className="cardTitle">Transaction status</div>
                  <div className="cardText" style={{ marginTop: 8 }}>
                    Once confirmed, the payment will be saved and a public proof link will be generated.
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>Tx hash</div>
                      <div style={{ ...monoBox, ...wrapLong }}>{pendingTxHash ?? "—"}</div>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>Confirm status</div>
                      <div style={monoBox}>{pendingTxHash ? confirmText : "—"}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ✅ Bounty-friendly progress UI */}
              {postPayStep !== "idle" && (
                <div className="card" style={{ padding: 16 }}>
                  <div className="cardTitle">Proof Progress</div>

                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <StepRow
                      label="Saving"
                      active={postPayStep === "saving"}
                      done={["generating_receipt", "anchoring", "ready"].includes(postPayStep)}
                    />
                    <StepRow
                      label="Generating receipt"
                      active={postPayStep === "generating_receipt"}
                      done={["anchoring", "ready"].includes(postPayStep)}
                    />
                    <StepRow
                      label="Anchoring on Flare"
                      active={postPayStep === "anchoring"}
                      done={postPayStep === "ready"}
                    />
                  </div>

                  <div style={{ marginTop: 12, opacity: 0.85, whiteSpace: "pre-wrap" }}>{postPayDetail}</div>

                  {postPayStep === "ready" && (
                    <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {proofrailsReceiptId && (
                        <>
                          <Link className="btn btn-primary" href={`/receipt/${proofrailsReceiptId}`}>
                            View receipt
                          </Link>
                          <Link className="btn" href={`/receipt/${proofrailsReceiptId}?download=pdf`}>
                            Download PDF
                          </Link>
                          <Link className="btn" href={`/receipt/${proofrailsReceiptId}?download=jpg`}>
                            Download JPG
                          </Link>
                        </>
                      )}

                      {proofSlug && (
                        <Link className="btn" href={`/proof/${proofSlug}`}>
                          View proof page
                        </Link>
                      )}
                    </div>
                  )}

                  {postPayStep === "error" && (
                    <div className="card" style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      ❌ {postPayDetail}
                    </div>
                  )}
                </div>
              )}

              {/* Messages */}
              {msg && (
  <div
    className="card"
    style={{
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
      maxWidth: "100%",
    }}
  >
    {msg}
  </div>
)}


              {/* ProofRails Debug (hide later for bounty UI) */}
              {debug && (
                <div className="card" style={{ padding: 16 }}>
                  <div className="cardTitle">ProofRails debug</div>
                  <div className="cardText" style={{ marginTop: 8 }}>
                    This shows the exact reason ProofRails failed so you can fix it quickly.
                  </div>

                  <pre
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 12,
                      background: "rgba(0,0,0,0.18)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      overflowX: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontSize: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    {debug}
                  </pre>
                </div>
              )}

              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <Link className="btn" href="/pay/create">
                  Create another invoice
                </Link>
                <Link className="btn" href="/">
                  Back home
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* bottom spacer */}
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="kicker">
            <span className="dot" />
            Next
          </div>
          <div
            className="grid3"
            style={{
              marginTop: 12,
              gap: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            <div className="card" style={{ padding: 16 }}>
              <div className="cardTitle">Open your proof page</div>
              <div className="cardText" style={{ marginTop: 8 }}>
                After payment, open the proof link and watch ProofRails status update automatically.
              </div>
            </div>
            
            
          </div>
        </div>
      </section>
    </main>
  );
}

/* ===================== UI HELPERS ===================== */

const wrapLong: React.CSSProperties = {
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const monoBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 12,
  lineHeight: 1.35,
};

// IMPORTANT: template string so it never breaks on paste
const bgWash: React.CSSProperties = {
  position: "absolute",
  inset: -40,
  pointerEvents: "none",
  background: `
    radial-gradient(900px 500px at 20% 15%, rgba(16,185,129,0.14), transparent 60%),
    radial-gradient(800px 500px at 85% 35%, rgba(99,102,241,0.14), transparent 60%),
    radial-gradient(900px 650px at 50% 95%, rgba(16,185,129,0.10), transparent 55%)
  `,
  opacity: 0.9,
};
