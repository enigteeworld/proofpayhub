"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { keccak256, toBytes, encodeFunctionData } from "viem";
import {
  useAccount,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useChainId,
  useSwitchChain,
} from "wagmi";

/* ===================== TYPES ===================== */

type ProofRow = {
  id: string;
  public_slug: string;
  anchored_on_flare: boolean;
  flare_anchor_ref: string | null;

  // ProofRails fields (your current schema in this page)
  proofrails_record_type: string | null;
  proofrails_record_id: string | null;

  created_at: string;
  payment_id: string;
};

type PaymentRow = {
  id: string;
  payer_address: string;
  payee_address: string;
  tx_hash: string;
  amount: number;
  token_symbol: string;
  created_at: string;
};

/* ===================== CONSTANTS ===================== */

const FLARE_TESTNET_CHAIN_ID = 114;

// This is for the onchain anchor action from the Proof page (your Remix deployed contract)
const ANCHOR_ADDRESS = (process.env.NEXT_PUBLIC_PROOF_ANCHOR_ADDRESS || "") as `0x${string}`;

const ANCHOR_ABI = [
  {
    type: "function",
    name: "anchor",
    stateMutability: "nonpayable",
    inputs: [{ name: "proofHash", type: "bytes32" }],
    outputs: [],
  },
] as const;

/* ===================== UTILS ===================== */

function prettyJson(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

// Supports: flat, {receipt:{receipt_id}}, {data:{receipt_id}}, etc.
function extractReceiptId(pr: any): string | null {
  if (!pr) return null;

  const direct =
    pr.receipt_id ??
    pr.receiptId ??
    pr.id ??
    pr.rid ??
    pr.receiptID ??
    null;

  if (typeof direct === "string" && direct.length > 10) return direct;

  const nested =
    pr.receipt?.receipt_id ??
    pr.receipt?.receiptId ??
    pr.receipt?.id ??
    pr.receipt?.rid ??
    null;

  if (typeof nested === "string" && nested.length > 10) return nested;

  const dataNested =
    pr.data?.receipt_id ??
    pr.data?.receiptId ??
    pr.data?.id ??
    pr.data?.rid ??
    null;

  if (typeof dataNested === "string" && dataNested.length > 10) return dataNested;

  return null;
}

function extractReceiptStatus(pr: any): string | null {
  return pr?.status ?? pr?.receipt?.status ?? pr?.data?.status ?? null;
}

/* ===================== COMPONENT ===================== */

export default function ProofPage() {
  const params = useParams<{ slug: string }>();
  const slug = useMemo(() => params?.slug, [params]);

  const [proof, setProof] = useState<ProofRow | null>(null);
  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [loading, setLoading] = useState(true);

  const [msg, setMsg] = useState("");
  const [debug, setDebug] = useState<any>(null);

  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const [anchorTxHash, setAnchorTxHash] = useState<`0x${string}` | null>(null);
  const anchorReceipt = useWaitForTransactionReceipt({ hash: anchorTxHash ?? undefined });

  const [creatingReceipt, setCreatingReceipt] = useState(false);
  const [anchoring, setAnchoring] = useState(false);

  /* ===================== LOAD DATA ===================== */

  async function load() {
    setLoading(true);
    setMsg("");
    setDebug(null);

    try {
      const { data: proofData, error: proofErr } = await supabase
        .from("proofs")
        .select("*")
        .eq("public_slug", slug)
        .single();

      if (proofErr) throw proofErr;
      setProof(proofData);

      const { data: payData, error: payErr } = await supabase
        .from("payments")
        .select("*")
        .eq("id", proofData.payment_id)
        .single();

      if (payErr) throw payErr;
      setPayment(payData);
    } catch (e: any) {
      setMsg(`❌ Could not load proof\n${e?.message ?? "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (slug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  /* ===================== HELPERS ===================== */

  async function ensureFlareTestnet() {
    if (chainId === FLARE_TESTNET_CHAIN_ID) return;
    await switchChainAsync({ chainId: FLARE_TESTNET_CHAIN_ID });
  }

  /* ===================== PROOFRAILS ===================== */

  async function createProofRailsReceipt() {
    setMsg("");
    setDebug(null);

    if (!proof || !payment) return;

    if (proof.proofrails_record_id) {
      return setMsg("ProofRails receipt already exists ✅");
    }

    setCreatingReceipt(true);

    try {
      // Send FLAT body (your Next API route supports both, but flat avoids mistakes)
      const body = {
        tip_tx_hash: payment.tx_hash,
        chain: "coston2",
        amount: String(payment.amount),
        currency: payment.token_symbol,
        sender_wallet: payment.payer_address,
        receiver_wallet: payment.payee_address,
        reference: proof.id, // stable reference per proof
      };

      const r = await fetch("/api/proofrails/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await r.json().catch(() => null);

      if (!r.ok || !data?.ok) {
        setMsg(
          `❌ PROOFRAILS CREATE FAILED\n` +
            `HTTP ${r.status} ${r.statusText || ""}\n\n` +
            `Message:\n${String(data?.message ?? data?.error ?? "Unknown error")}\n\n` +
            `Tip:\n${String(data?.tip ?? "—")}`
        );
        setDebug(data);
        return;
      }

      const receiptId = extractReceiptId(data);
      const status = extractReceiptStatus(data) ?? "pending";

      if (!receiptId) {
        setMsg("❌ PROOFRAILS RESPONSE HAD NO RECEIPT ID");
        setDebug(data);
        return;
      }

      const { error } = await supabase
        .from("proofs")
        .update({
          proofrails_record_type: "tip",
          proofrails_record_id: receiptId,
        })
        .eq("id", proof.id);

      if (error) throw error;

      setMsg(`✅ ProofRails receipt created!\nReceipt ID: ${receiptId}\nStatus: ${status}`);
      setDebug(data);

      await load();
    } catch (e: any) {
      setMsg(`❌ ProofRails error\n${e?.message ?? "Unknown error"}`);
    } finally {
      setCreatingReceipt(false);
    }
  }

  /* ===================== ANCHOR LOGIC ===================== */

  async function anchorOnFlare() {
    setMsg("");
    setDebug(null);

    if (!proof || !payment) return;

    if (!isConnected) {
      return setMsg(`Please connect your wallet first.\nUse the Pay page connect button.`);
    }

    if (!ANCHOR_ADDRESS || !ANCHOR_ADDRESS.startsWith("0x")) {
      return setMsg(
        `Missing anchor contract address.\n` +
          `Set NEXT_PUBLIC_PROOF_ANCHOR_ADDRESS\n` +
          `in .env.local and restart the app.`
      );
    }

    if (proof.anchored_on_flare) {
      return setMsg(`This proof is already anchored on Flare ✅`);
    }

    setAnchoring(true);
    setAnchorTxHash(null);

    try {
      await ensureFlareTestnet();

      // Keep the same logic you had:
      // proofHash derived from payment tx hash
      const proofHash = keccak256(toBytes(payment.tx_hash));

      const data = encodeFunctionData({
        abi: ANCHOR_ABI,
        functionName: "anchor",
        args: [proofHash],
      });

      setMsg(`Sending anchor transaction to Flare…\nPlease confirm in MetaMask.`);

      const tx = await sendTransactionAsync({
        to: ANCHOR_ADDRESS,
        data,
        value: 0n,
      });

      setAnchorTxHash(tx);

      setMsg(`Anchor transaction sent.\nTx hash:\n${tx}\n\nWaiting for confirmation…`);
    } catch (e: any) {
      setMsg(`❌ Anchor failed\n${e?.shortMessage ?? e?.message ?? "Unknown error"}`);
      setAnchorTxHash(null);
    } finally {
      setAnchoring(false);
    }
  }

  /* ===================== CONFIRM ANCHOR ===================== */

  useEffect(() => {
    async function onConfirmed() {
      if (!proof || !anchorTxHash) return;
      if (anchorReceipt.status !== "success") return;

      const { error } = await supabase
        .from("proofs")
        .update({
          anchored_on_flare: true,
          flare_anchor_ref: anchorTxHash,
        })
        .eq("id", proof.id);

      if (!error) {
        setMsg(`✅ Proof successfully anchored on Flare!\nAnchor tx:\n${anchorTxHash}`);
        await load();
      } else {
        setMsg(`⚠️ Anchor confirmed onchain, but failed to save to Supabase:\n${error.message}`);
      }
    }

    onConfirmed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorReceipt.status, anchorTxHash]);

  /* ===================== UI ===================== */

  if (loading) {
    return (
      <main className="container page">
        <div className="panel" style={{ padding: 16 }}>
          <div className="muted">Loading proof…</div>
        </div>
      </main>
    );
  }

  if (!proof || !payment) {
    return (
      <main className="container page">
        <div className="panel" style={{ padding: 18 }}>
          <h1 className="h1" style={{ fontSize: 26, margin: 0 }}>
            Proof not found
          </h1>
          {msg && (
            <pre className="kvVal" style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>
              {msg}
            </pre>
          )}
          <div style={{ marginTop: 12 }}>
            <Link className="btn" href="/">
              Back home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const paymentTxUrl = payment.tx_hash
    ? `https://coston2-explorer.flare.network/tx/${payment.tx_hash}`
    : null;

  const anchorTxUrl = proof.flare_anchor_ref
    ? `https://coston2-explorer.flare.network/tx/${proof.flare_anchor_ref}`
    : null;

  const receiptId = proof.proofrails_record_id;

  return (
    <main className="container page">
      <div className="panel" style={{ padding: 18 }}>
        <div className="kicker">
          <span className="dot" />
          Public proof link (read-only)
        </div>

        <h1 className="h1" style={{ fontSize: 34, marginTop: 10 }}>
          Payment Proof
        </h1>

        <p className="lead" style={{ marginTop: 10 }}>
          This page is public and read-only. Anyone can verify the payment and anchor transactions
          via explorer links. You can also generate a ProofRails receipt from the recorded payment.
        </p>

        <div className="kv" style={{ marginTop: 14 }}>
          <div className="kvItem">
            <div className="kvKey">Amount</div>
            <div className="kvVal">
              {payment.amount} {payment.token_symbol}
            </div>
          </div>

          <div className="kvItem">
            <div className="kvKey">Payer</div>
            <div className="kvVal" style={{ overflowWrap: "anywhere" }}>
              {payment.payer_address}
            </div>
          </div>

          <div className="kvItem">
            <div className="kvKey">Payee</div>
            <div className="kvVal" style={{ overflowWrap: "anywhere" }}>
              {payment.payee_address}
            </div>
          </div>

          <div className="kvItem">
            <div className="kvKey">Payment tx hash</div>
            <div className="kvVal" style={{ overflowWrap: "anywhere" }}>
              {payment.tx_hash}
            </div>
          </div>

          <div className="kvItem">
            <div className="kvKey">Anchored on Flare</div>
            <div className="kvVal">{proof.anchored_on_flare ? "Yes ✅" : "No"}</div>
          </div>

          <div className="kvItem">
            <div className="kvKey">ProofRails receipt</div>
            <div className="kvVal" style={{ overflowWrap: "anywhere" }}>
              {receiptId ?? "Not generated yet"}
            </div>
          </div>

          <div className="kvItem">
            <div className="kvKey">Flare anchor tx</div>
            <div className="kvVal" style={{ overflowWrap: "anywhere" }}>
              {proof.flare_anchor_ref ?? "—"}
            </div>
          </div>
        </div>

        <div className="hr" />

        <div className="grid3" style={{ gridTemplateColumns: "1fr", gap: 12 }}>
          {/* Verify */}
          <div className="card" style={{ padding: 16 }}>
            <div className="cardTitle" style={{ marginTop: 0 }}>
              Verify on Flare Explorer
            </div>
            <div className="cardText">Use these links to verify the payment and anchor transactions live.</div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {paymentTxUrl && (
                <a className="btn" href={paymentTxUrl} target="_blank" rel="noopener noreferrer">
                  🔗 View payment transaction
                </a>
              )}
              {anchorTxUrl && (
                <a className="btn" href={anchorTxUrl} target="_blank" rel="noopener noreferrer">
                  🔗 View anchor transaction
                </a>
              )}
            </div>
          </div>

          {/* ProofRails */}
          <div className="card" style={{ padding: 16 }}>
            <div className="cardTitle" style={{ marginTop: 0 }}>
              ProofRails receipt
            </div>
            <div className="cardText">
              Generates an ISO-style receipt record from this payment using your local middleware.
              If it fails, you’ll see the exact reason and raw response.
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={createProofRailsReceipt}
                disabled={creatingReceipt || !!receiptId}
              >
                {!!receiptId
                  ? "Receipt already generated ✅"
                  : creatingReceipt
                  ? "Generating…"
                  : "Generate ProofRails receipt"}
              </button>

              {/* New: link to your app route */}
              {!!receiptId && (
                <Link className="btn" href={`/receipt/${receiptId}`}>
                  View Receipt
                </Link>
              )}

              {/* Optional: keep middleware link too */}
              {!!receiptId && (
                <a
                  className="btn"
                  href={`http://localhost:8787/receipt/${receiptId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open middleware receipt
                </a>
              )}
            </div>

            {debug && (
              <details style={{ marginTop: 12 }}>
                <summary className="muted" style={{ cursor: "pointer", fontWeight: 900 }}>
                  Show debug details
                </summary>
                <pre style={{ marginTop: 10, whiteSpace: "pre-wrap", fontSize: 12 }}>
                  {prettyJson(debug)}
                </pre>
              </details>
            )}
          </div>

          {/* Anchor */}
          <div className="card" style={{ padding: 16 }}>
            <div className="cardTitle" style={{ marginTop: 0 }}>
              Anchor proof hash on Flare
            </div>
            <div className="cardText">
              Anchors a hash derived from the payment tx hash to your deployed anchor contract on Coston2.
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={anchorOnFlare}
                disabled={proof.anchored_on_flare || anchoring}
              >
                {proof.anchored_on_flare
                  ? "Already Anchored"
                  : anchoring
                  ? "Sending…"
                  : "Anchor on Flare now"}
              </button>

              {anchorTxHash && (
                <span className="badgePill" style={{ overflowWrap: "anywhere" }}>
                  Anchor tx submitted: {anchorTxHash}
                </span>
              )}

              {anchorReceipt.isLoading && anchorTxHash && (
                <span className="muted">Waiting for confirmation…</span>
              )}

              {anchorReceipt.status === "error" && anchorTxHash && (
                <span className="muted">Anchor tx failed ❌</span>
              )}
            </div>
          </div>
        </div>

        {msg && (
          <div className="card" style={{ marginTop: 14, padding: 14 }}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg}</pre>
          </div>
        )}

        <div className="row" style={{ marginTop: 14 }}>
          <Link href="/" className="btn">
            Back home
          </Link>
          <Link href="/pay/create" className="btn btn-primary">
            Create invoice
          </Link>
        </div>
      </div>
    </main>
  );
}

