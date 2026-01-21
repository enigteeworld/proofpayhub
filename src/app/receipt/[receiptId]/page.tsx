"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ReceiptCard, ProofRailsReceiptViewModel } from "@/components/ReceiptCard";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

type ApiResponse = {
  ok: boolean;
  baseUrl?: string;
  receipt?: any;
  record?: any;
  links?: {
    receiptUrl?: string;
    xml_url?: string | null;
    bundle_url?: string | null;
    receipt_json_url?: string;
    tip_json_url?: string;
  };
  error?: string;
  raw?: any;
  details?: string;
};

function explorerBase(chain?: string) {
  const c = (chain || "").toLowerCase();
  if (c.includes("coston2")) return "https://coston2-explorer.flare.network";
  if (c.includes("flare") || c.includes("mainnet")) return "https://flare-explorer.flare.network";
  return "https://coston2-explorer.flare.network";
}

async function safeJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  const t = await r.text();
  try {
    return { ok: r.ok, status: r.status, json: JSON.parse(t) };
  } catch {
    return { ok: r.ok, status: r.status, json: null as any };
  }
}

function pickString(...vals: any[]) {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function getQueryDownloadMode(): null | "pdf" | "jpg" {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("download");
  if (!v) return null;
  const s = v.toLowerCase();
  if (s === "pdf") return "pdf";
  if (s === "jpg" || s === "jpeg") return "jpg";
  return null;
}

export default function ReceiptPage() {
  const params = useParams<{ receiptId: string }>();
  const receiptId = useMemo(() => params?.receiptId, [params]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [raw, setRaw] = useState<ApiResponse | null>(null);
  const [vm, setVm] = useState<ProofRailsReceiptViewModel | null>(null);

  const receiptWrapRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState<null | "pdf" | "jpg">(null);
  const [autoDownloaded, setAutoDownloaded] = useState(false);

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!receiptId) {
        setLoading(false);
        setErr("Missing receiptId");
        return;
      }

      setLoading(true);
      setErr("");
      setRaw(null);
      setVm(null);

      try {
        const r = await fetch(`/api/proofrails/receipt/${receiptId}`, { cache: "no-store" });
        const data: ApiResponse = await r.json().catch(() => ({ ok: false, error: "Bad JSON" }));

        if (!alive) return;
        setRaw(data);

        if (!r.ok || !data.ok || !data.receipt) {
          setErr(data?.error || `Failed to load receipt (${r.status})`);
          setLoading(false);
          return;
        }

        // Fetch tip.json + receipt.json (these hold payer wallet + tx hash + amount/currency)
        const tipUrl = data.links?.tip_json_url || "";
        const receiptJsonUrl = data.links?.receipt_json_url || "";

        const tipRes = tipUrl ? await safeJson(tipUrl) : null;
        const recRes = receiptJsonUrl ? await safeJson(receiptJsonUrl) : null;

        const tipJson = tipRes?.ok ? tipRes.json : null;
        const receiptJson = recRes?.ok ? recRes.json : null;

        const receipt = data.receipt || {};
        const record = data.record || {};

        const chain = pickString(
          tipJson?.chain,
          receiptJson?.chain,
          record?.chain,
          receipt?.chain,
          "coston2"
        );
        const exp = explorerBase(chain);

        const txHash = pickString(
          tipJson?.tip_tx_hash,
          receiptJson?.tip_tx_hash,
          tipJson?.tx_hash,
          receiptJson?.tx_hash,
          record?.tip_tx_hash,
          record?.tx_hash,
          receipt?.tip_tx_hash,
          receipt?.tx_hash
        );

        const payer = pickString(
          tipJson?.sender_wallet,
          receiptJson?.sender_wallet,
          tipJson?.sender,
          receiptJson?.sender,
          tipJson?.from,
          receiptJson?.from,
          record?.sender_wallet,
          record?.payer_address
        );

        const payee = pickString(
          tipJson?.receiver_wallet,
          receiptJson?.receiver_wallet,
          tipJson?.receiver,
          receiptJson?.receiver,
          tipJson?.to,
          receiptJson?.to,
          record?.receiver_wallet,
          record?.payee_address
        );

        const amount = pickString(tipJson?.amount, receiptJson?.amount, record?.amount);
        const currency = pickString(tipJson?.currency, receiptJson?.currency, record?.currency);

        const title = pickString(
          tipJson?.reference,
          receiptJson?.reference,
          receipt?.reference,
          record?.reference,
          "Payment"
        );

        const createdAt = pickString(
          receipt?.created_at,
          receiptJson?.created_at,
          tipJson?.created_at,
          receipt?.anchored_at,
          receiptJson?.anchored_at,
          new Date().toISOString()
        );

        const receiptPublicUrl =
          typeof window !== "undefined" ? `${window.location.origin}/receipt/${receiptId}` : undefined;

        const paymentExplorerUrl = txHash ? `${exp}/tx/${txHash}` : null;
        const anchorExplorerUrl = receipt?.flare_txid ? `${exp}/tx/${receipt.flare_txid}` : null;

        const built: ProofRailsReceiptViewModel = {
          appName: "ProofPay Hub",
          receiptId: receipt?.id || receiptId,
          title,
          typeLabel: "RECEIPT",
          timestampISO: createdAt,
          status: pickString(receipt?.status, receiptJson?.status, "pending"),

          amount: amount ? String(amount) : "—",
          currency: currency ? String(currency) : "—",

          wallet: payer ? payer : "—",
          txHash: txHash ? txHash : "—",
          networkLabel: chain.toLowerCase().includes("coston2") ? "Flare Coston2" : "Flare",
          payee: payee || undefined,

          bundleHash: receipt?.bundle_hash ?? receiptJson?.bundle_hash ?? null,
          flareTxid: receipt?.flare_txid ?? receiptJson?.flare_txid ?? null,

          paymentExplorerUrl,
          anchorExplorerUrl,
          receiptPublicUrl,
          proofrailsReceiptUrl: data.links?.receiptUrl,
        };

        setVm(built);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Unknown error");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [receiptId]);

  async function downloadAsJpg() {
    if (!receiptWrapRef.current) return;
    setDownloading("jpg");

    try {
      const canvas = await html2canvas(receiptWrapRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const url = canvas.toDataURL("image/jpeg", 0.95);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${receiptId}.jpg`;
      a.click();
    } finally {
      setDownloading(null);
    }
  }

  async function downloadAsPdf() {
    if (!receiptWrapRef.current) return;
    setDownloading("pdf");

    try {
      const canvas = await html2canvas(receiptWrapRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      // If taller than page, pin to top (avoid cutting off header)
      const y = imgH > pageH ? 0 : (pageH - imgH) / 2;

      pdf.addImage(imgData, "JPEG", 0, y, imgW, imgH, undefined, "FAST");
      pdf.save(`receipt-${receiptId}.pdf`);
    } finally {
      setDownloading(null);
    }
  }

  // ✅ AUTO DOWNLOAD from query param
  useEffect(() => {
    if (!vm) return;
    if (autoDownloaded) return;
    if (downloading) return;

    const mode = getQueryDownloadMode();
    if (!mode) return;

    setAutoDownloaded(true);

    // let the DOM paint before capture
    const t = setTimeout(() => {
      if (mode === "pdf") downloadAsPdf();
      if (mode === "jpg") downloadAsJpg();
    }, 350);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm, autoDownloaded, downloading]);

  if (loading) {
    return (
      <main style={{ padding: 18 }}>
        <div style={panel}>
          <div style={{ fontWeight: 900 }}>Loading receipt…</div>
          <div style={{ opacity: 0.75, marginTop: 8 }}>Receipt ID: {receiptId}</div>
        </div>
      </main>
    );
  }

  if (err || !vm) {
    return (
      <main style={{ padding: 18 }}>
        <div style={panel}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Receipt not available</div>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 12, fontSize: 13 }}>{err}</pre>

          {raw && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 900 }}>Debug</summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 10, fontSize: 12 }}>
                {JSON.stringify(raw, null, 2)}
              </pre>
            </details>
          )}

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/" style={btn}>
              Back home
            </Link>
            <Link href="/pay/create" style={btnPrimary}>
              Create invoice
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const xmlUrl = raw?.links?.xml_url || null;
  const bundleUrl = raw?.links?.bundle_url || null;

  return (
    <main style={{ padding: 0 }}>
      <div ref={receiptWrapRef}>
        <ReceiptCard data={vm} />
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 12px 26px" }}>
        <div style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Downloads</div>
              <div style={{ opacity: 0.75, marginTop: 6 }}>
                Export this receipt as PDF or JPG (client-side).
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={downloadAsPdf} style={btnPrimary} disabled={downloading !== null}>
                {downloading === "pdf" ? "Generating PDF…" : "Download PDF"}
              </button>
              <button onClick={downloadAsJpg} style={btn} disabled={downloading !== null}>
                {downloading === "jpg" ? "Generating JPG…" : "Download JPG"}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Files</div>
            <div style={{ opacity: 0.75, marginTop: 6 }}>
              Served by your middleware at <b>{raw?.baseUrl}</b>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {xmlUrl && (
                <a href={xmlUrl} target="_blank" rel="noreferrer" style={btnPrimary}>
                  Open XML
                </a>
              )}
              {bundleUrl && (
                <a href={bundleUrl} target="_blank" rel="noreferrer" style={btn}>
                  Download evidence.zip
                </a>
              )}
              {raw?.links?.receiptUrl && (
                <a href={raw.links.receiptUrl} target="_blank" rel="noreferrer" style={btn}>
                  Open middleware receipt page
                </a>
              )}
            </div>

            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: "pointer", fontWeight: 900 }}>Raw API response</summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 10, fontSize: 12 }}>
                {JSON.stringify(raw, null, 2)}
              </pre>
            </details>

            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/" style={btn}>
                Back home
              </Link>
              <Link href="/pay/create" style={btnPrimary}>
                Create invoice
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

const panel: React.CSSProperties = {
  maxWidth: 860,
  margin: "14px auto 0",
  borderRadius: 14,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
  boxShadow: "0 12px 26px rgba(0,0,0,0.06)",
};

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  textDecoration: "none",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
  background: "#fff",
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "rgba(16,185,129,0.18)",
  border: "1px solid rgba(16,185,129,0.35)",
};
