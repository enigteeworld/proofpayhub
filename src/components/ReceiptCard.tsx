"use client";

import React, { useEffect, useMemo, useState } from "react";

type ReceiptStatus = "pending" | "anchored" | "failed" | string;

export type ProofRailsReceiptViewModel = {
  appName?: string;
  receiptId: string;
  title?: string;

  typeLabel?: string;
  timestampISO: string;
  status: ReceiptStatus;

  amount: string;
  currency: string;

  wallet: string; // payer
  txHash: string; // payment tx hash (tip_tx_hash)
  networkLabel: string;
  payee?: string;

  bundleHash?: string | null;
  flareTxid?: string | null;

  paymentExplorerUrl?: string | null;
  anchorExplorerUrl?: string | null;

  receiptPublicUrl?: string;
  proofrailsReceiptUrl?: string;
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusPill(status: ReceiptStatus) {
  const s = (status || "").toLowerCase();
  if (s === "anchored") return { label: "VERIFIED", tone: "good" as const };
  if (s === "pending") return { label: "PENDING", tone: "warn" as const };
  if (s === "failed") return { label: "FAILED", tone: "bad" as const };
  return { label: String(status || "—").toUpperCase(), tone: "muted" as const };
}

async function makeQrDataUrl(text: string) {
  // Optional: npm i qrcode
  try {
    const mod: any = await import("qrcode");
    const QRCode = mod?.default || mod;
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: 220,
      errorCorrectionLevel: "M",
    });
  } catch {
    return "";
  }
}

function clamp(v: string, max = 28) {
  if (!v) return "";
  if (v.length <= max) return v;
  return v.slice(0, max - 1) + "…";
}

function isPlaceholder(v: string) {
  const s = (v || "").trim();
  return !s || s === "—" || s === "--" || s.toLowerCase() === "n/a";
}

// Simple “barcode” look without dependencies (works well in screenshots/PDFs)
function barcodePatternFromHex(hex: string) {
  const h = (hex || "").replace(/^0x/i, "").toLowerCase();
  if (!h) return "";
  const bits: string[] = [];
  for (let i = 0; i < Math.min(h.length, 64); i++) {
    const n = parseInt(h[i], 16);
    if (Number.isNaN(n)) continue;
    // 4 bits per hex char
    bits.push(((n >> 3) & 1) ? "1" : "0");
    bits.push(((n >> 2) & 1) ? "1" : "0");
    bits.push(((n >> 1) & 1) ? "1" : "0");
    bits.push((n & 1) ? "1" : "0");
  }
  return bits.join("");
}

function BarCode({ hex }: { hex: string }) {
  const bits = useMemo(() => barcodePatternFromHex(hex), [hex]);

  if (!bits) {
    return <div style={styles.barcodeEmpty}>—</div>;
  }

  // render as tiny vertical bars
  const bars = [];
  // limit to keep DOM light
  const N = Math.min(bits.length, 220);
  for (let i = 0; i < N; i++) {
    const on = bits[i] === "1";
    bars.push(
      <span
        key={i}
        style={{
          display: "inline-block",
          width: 2,
          height: on ? 34 : 18,
          background: on ? "#111827" : "rgba(17,24,39,0.18)",
          marginRight: 1,
          borderRadius: 1,
        }}
      />
    );
  }

  return (
    <div style={styles.barcodeWrap}>
      <div style={styles.barcodeBars}>{bars}</div>
      <div style={styles.barcodeText}>{hex}</div>
    </div>
  );
}

export function ReceiptCard({ data }: { data: ProofRailsReceiptViewModel }) {
  const [qr, setQr] = useState<string>("");

  const pill = useMemo(() => statusPill(data.status), [data.status]);

  const qrText = useMemo(() => {
    return (data.receiptPublicUrl || data.proofrailsReceiptUrl || "").trim();
  }, [data.receiptPublicUrl, data.proofrailsReceiptUrl]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!qrText) {
        setQr("");
        return;
      }
      const url = await makeQrDataUrl(qrText);
      if (!alive) return;
      setQr(url);
    })();
    return () => {
      alive = false;
    };
  }, [qrText]);

  const headerTitle = data.appName || "ProofPay Hub";
  const subTitle = "DECENTRALIZED PAYMENT RECEIPT";

  const amountOk = !isPlaceholder(data.amount) && data.amount !== "0";
  const currencyOk = !isPlaceholder(data.currency);

  const walletOk = !isPlaceholder(data.wallet);
  const txOk = !isPlaceholder(data.txHash);

  return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={styles.headerTitle}>{headerTitle}</div>
            <div style={styles.headerSubtitle}>{subTitle}</div>
          </div>

          <div style={styles.headerRight}>
            <div style={styles.headerRightLabel}>ID</div>
            <div style={styles.headerRightValue}>{data.receiptId}</div>
          </div>
        </div>

        <div style={styles.body}>
          <div style={styles.itemTitleRow}>
            <div style={styles.itemTitle}>{data.title || "Payment"}</div>
            <div style={styles.orangeLine} />
          </div>

          <div style={styles.tripRow}>
            <div style={styles.tripCol}>
              <div style={styles.tripLabel}>TYPE</div>
              <div style={styles.tripValue}>{data.typeLabel || "CREATED"}</div>
            </div>

            <div style={styles.tripCol}>
              <div style={styles.tripLabel}>TIMESTAMP</div>
              <div style={styles.tripValue}>{formatDate(data.timestampISO)}</div>
            </div>

            <div style={styles.tripCol}>
              <div style={styles.tripLabel}>STATUS</div>
              <div style={styles.statusWrap}>
                <span
                  style={{
                    ...styles.statusPill,
                    ...(pill.tone === "good"
                      ? styles.statusGood
                      : pill.tone === "warn"
                      ? styles.statusWarn
                      : pill.tone === "bad"
                      ? styles.statusBad
                      : styles.statusMuted),
                  }}
                >
                  {pill.label}
                </span>
              </div>
            </div>
          </div>

          <div style={styles.amountBlock}>
            <div style={styles.amountLabel}>AMOUNT</div>
            <div style={styles.amountValue}>
              {amountOk ? data.amount : "—"} {currencyOk ? data.currency : "—"}
            </div>
          </div>

          <div style={styles.proofBox}>
            <div style={styles.proofBoxTitle}>BLOCKCHAIN PROOF</div>

            <div style={styles.proofLine}>
              <div style={styles.proofKey}>WALLET:</div>
              <div style={styles.proofVal}>{walletOk ? data.wallet : "—"}</div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={styles.proofKeyInline}>TX HASH (barcode):</div>
              <BarCode hex={txOk ? data.txHash : ""} />
            </div>

            <div style={styles.proofLine}>
              <div style={styles.proofKey}>NETWORK:</div>
              <div style={styles.proofVal}>{data.networkLabel}</div>
            </div>

            {data.payee ? (
              <div style={styles.proofLine}>
                <div style={styles.proofKey}>PAYEE:</div>
                <div style={styles.proofVal}>{data.payee}</div>
              </div>
            ) : null}
          </div>

          <div style={styles.verifyRow}>
            <div style={styles.verifyLeft}>
              <div style={styles.verifyTitle}>ProofRails Verification</div>

              <div style={styles.verifyIdLine}>
                <span style={styles.verifyIdLabel}>Receipt ID:</span>
                <span style={styles.verifyIdValue}>{data.receiptId}</span>
              </div>

              <div style={styles.verifyHint}>Scan to verify on-chain authenticity</div>

              {(data.bundleHash || data.flareTxid) && (
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {data.bundleHash && (
                    <div style={styles.metaRow}>
                      <div style={styles.metaKey}>Bundle hash</div>
                      <div style={styles.metaVal}>{data.bundleHash}</div>
                    </div>
                  )}
                  {data.flareTxid && (
                    <div style={styles.metaRow}>
                      <div style={styles.metaKey}>Anchor tx</div>
                      <div style={styles.metaVal}>{data.flareTxid}</div>
                    </div>
                  )}
                </div>
              )}

              {(data.paymentExplorerUrl || data.anchorExplorerUrl || data.proofrailsReceiptUrl) && (
                <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {data.paymentExplorerUrl && (
                    <a style={styles.linkBtn} href={data.paymentExplorerUrl} target="_blank" rel="noreferrer">
                      View payment tx
                    </a>
                  )}
                  {data.anchorExplorerUrl && (
                    <a style={styles.linkBtn} href={data.anchorExplorerUrl} target="_blank" rel="noreferrer">
                      View anchor tx
                    </a>
                  )}
                  {data.proofrailsReceiptUrl && (
                    <a style={styles.linkBtn} href={data.proofrailsReceiptUrl} target="_blank" rel="noreferrer">
                      Open ProofRails receipt
                    </a>
                  )}
                </div>
              )}

              {/* helpful mini debug (safe for UI; remove for bounty if you want) */}
              {(!walletOk || !txOk) && (
                <div style={styles.miniWarn}>
                  Missing fields from tip.json/receipt.json. Check middleware artifacts for this receipt.
                </div>
              )}
            </div>

            <div style={styles.qrWrap}>
              <div style={styles.qrBox}>
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="QR code" style={styles.qrImg} />
                ) : (
                  <div style={styles.qrFallback}>
                    <div style={{ fontWeight: 800, fontSize: 12 }}>QR</div>
                    <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6, lineHeight: 1.35 }}>
                      Install <span style={styles.mono}>qrcode</span> to render:
                      <br />
                      <span style={styles.mono}>npm i qrcode</span>
                    </div>
                  </div>
                )}
              </div>

              <div style={styles.qrCaption}>
                {qrText ? (
                  <span style={{ overflowWrap: "anywhere" }}>{clamp(qrText, 44)}</span>
                ) : (
                  <span style={{ opacity: 0.75 }}>No verify link</span>
                )}
              </div>
            </div>
          </div>

          <div style={styles.footer}>
            <div style={styles.footerText}>
              This receipt is cryptographically generated and verifiable via ProofRails + Flare anchoring.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: { width: "100%", display: "flex", justifyContent: "center", padding: "24px 12px" },
  card: {
    width: "100%",
    maxWidth: 860,
    borderRadius: 14,
    overflow: "hidden",
    background: "#ffffff",
    boxShadow: "0 18px 50px rgba(0,0,0,0.10)",
    border: "1px solid rgba(0,0,0,0.06)",
  },
  header: {
    background: "linear-gradient(180deg, #121318 0%, #0c0d11 100%)",
    color: "#fff",
    padding: "22px 22px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: 900, letterSpacing: 0.2, lineHeight: 1.1 },
  headerSubtitle: { fontSize: 12, opacity: 0.78, letterSpacing: 0.8, fontWeight: 700 },
  headerRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginTop: 2 },
  headerRightLabel: { fontSize: 11, opacity: 0.72, fontWeight: 800, letterSpacing: 0.8 },
  headerRightValue: {
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.2,
    textAlign: "right",
    maxWidth: 260,
    overflowWrap: "anywhere",
  },
  body: { padding: "20px 22px 18px" },

  itemTitleRow: { marginTop: 4 },
  itemTitle: { fontSize: 28, fontWeight: 800, color: "#111827", lineHeight: 1.1 },
  orangeLine: { width: 90, height: 4, background: "#f59e0b", borderRadius: 999, marginTop: 10 },

  tripRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, marginTop: 18 },
  tripCol: { display: "flex", flexDirection: "column", gap: 6 },
  tripLabel: { fontSize: 12, color: "rgba(17,24,39,0.60)", letterSpacing: 0.6, fontWeight: 900 },
  tripValue: { fontSize: 14, fontWeight: 700, color: "#111827" },

  statusWrap: { display: "flex", alignItems: "center" },
  statusPill: {
    fontSize: 12,
    fontWeight: 900,
    padding: "6px 10px",
    borderRadius: 999,
    letterSpacing: 0.6,
    border: "1px solid rgba(0,0,0,0.08)",
  },
  statusGood: { background: "rgba(16,185,129,0.14)", color: "#065f46" },
  statusWarn: { background: "rgba(245,158,11,0.16)", color: "#92400e" },
  statusBad: { background: "rgba(239,68,68,0.14)", color: "#7f1d1d" },
  statusMuted: { background: "rgba(17,24,39,0.06)", color: "#111827" },

  amountBlock: { marginTop: 18 },
  amountLabel: { fontSize: 12, color: "rgba(17,24,39,0.60)", letterSpacing: 0.6, fontWeight: 900 },
  amountValue: { marginTop: 6, fontSize: 24, fontWeight: 900, color: "#f59e0b" },

  proofBox: {
    marginTop: 18,
    background: "#f3f4f6",
    border: "1px solid rgba(17,24,39,0.10)",
    borderRadius: 12,
    padding: "14px 14px",
  },
  proofBoxTitle: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.7,
    color: "rgba(17,24,39,0.65)",
    marginBottom: 10,
  },
  proofLine: { display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0" },
  proofKey: { width: 86, fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.70)", letterSpacing: 0.2 },
  proofKeyInline: { fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.70)", letterSpacing: 0.2 },
  proofVal: {
    flex: 1,
    fontSize: 12,
    fontWeight: 700,
    color: "#111827",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },

  barcodeWrap: {
    marginTop: 8,
    borderRadius: 12,
    border: "1px solid rgba(17,24,39,0.12)",
    background: "#fff",
    padding: "10px 10px",
  },
  barcodeBars: { display: "flex", alignItems: "flex-end", flexWrap: "nowrap", overflow: "hidden" },
  barcodeText: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: 900,
    color: "rgba(17,24,39,0.80)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  barcodeEmpty: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px dashed rgba(17,24,39,0.20)",
    background: "rgba(17,24,39,0.03)",
    fontWeight: 900,
    color: "rgba(17,24,39,0.60)",
  },

  verifyRow: {
    marginTop: 18,
    display: "grid",
    gridTemplateColumns: "1fr 240px",
    gap: 16,
    alignItems: "stretch",
  },
  verifyLeft: { paddingTop: 4 },
  verifyTitle: { fontSize: 18, fontWeight: 900, color: "#111827" },
  verifyIdLine: { marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" },
  verifyIdLabel: { fontSize: 13, fontWeight: 900, color: "rgba(17,24,39,0.75)" },
  verifyIdValue: { fontSize: 13, fontWeight: 800, color: "#111827", overflowWrap: "anywhere" },
  verifyHint: { marginTop: 10, fontSize: 12, color: "#f59e0b", fontWeight: 800 },

  metaRow: { display: "flex", gap: 10, alignItems: "flex-start" },
  metaKey: { width: 92, fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.70)" },
  metaVal: {
    flex: 1,
    fontSize: 12,
    fontWeight: 700,
    color: "#111827",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },

  qrWrap: { display: "flex", justifyContent: "flex-end", flexDirection: "column", alignItems: "flex-end", gap: 10 },
  qrBox: {
    width: 240,
    height: 240,
    borderRadius: 12,
    border: "1px solid rgba(17,24,39,0.10)",
    background: "#fff",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
  },
  qrImg: { width: 220, height: 220, objectFit: "contain" },
  qrFallback: {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    padding: 14,
    color: "rgba(17,24,39,0.80)",
  },
  qrCaption: { fontSize: 11, fontWeight: 900, color: "rgba(17,24,39,0.70)", textAlign: "right", maxWidth: 240 },
  mono: {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontWeight: 900,
  },

  linkBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(17,24,39,0.12)",
    background: "#ffffff",
    color: "#111827",
    textDecoration: "none",
    fontWeight: 900,
    fontSize: 13,
  },

  miniWarn: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(245,158,11,0.25)",
    background: "rgba(245,158,11,0.10)",
    fontSize: 12,
    fontWeight: 800,
    color: "#92400e",
    maxWidth: 560,
  },

  footer: {
    marginTop: 18,
    paddingTop: 14,
    borderTop: "1px solid rgba(17,24,39,0.10)",
    display: "flex",
    justifyContent: "center",
  },
  footerText: {
    fontSize: 12,
    color: "rgba(17,24,39,0.55)",
    fontWeight: 700,
    textAlign: "center",
    maxWidth: 520,
    lineHeight: 1.4,
  },
};
