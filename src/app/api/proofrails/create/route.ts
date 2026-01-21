import { NextResponse } from "next/server";

type TipInput = {
  tip_tx_hash?: string;
  chain?: string;
  amount?: string | number;
  currency?: string;
  sender_wallet?: string;
  receiver_wallet?: string;
  reference?: string;
  callback_url?: string;
};

function toStringAmount(v: any) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

function pickTip(body: any): TipInput {
  // Supports both shapes:
  // 1) { tip: { tx_hash, chain, amount, currency, sender, receiver, reference } }
  // 2) { tip_tx_hash, chain, amount, currency, sender_wallet, receiver_wallet, reference }
  const tip = body?.tip ?? body ?? {};

  return {
    tip_tx_hash: tip.tip_tx_hash ?? tip.tx_hash ?? tip.txHash,
    chain: tip.chain,
    amount: tip.amount,
    currency: tip.currency,
    sender_wallet: tip.sender_wallet ?? tip.sender ?? tip.from,
    receiver_wallet: tip.receiver_wallet ?? tip.receiver ?? tip.to,
    reference: tip.reference,
    callback_url: tip.callback_url ?? body?.callback_url,
  };
}

function missingFields(payload: TipInput) {
  const missing: string[] = [];
  if (!payload.tip_tx_hash) missing.push("tip_tx_hash");
  if (!payload.chain) missing.push("chain");
  if (!payload.amount) missing.push("amount");
  if (!payload.currency) missing.push("currency");
  if (!payload.sender_wallet) missing.push("sender_wallet");
  if (!payload.receiver_wallet) missing.push("receiver_wallet");
  if (!payload.reference) missing.push("reference");
  return missing;
}

async function readRaw(res: Response) {
  const text = await res.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null as any };
  }
}

export async function POST(req: Request) {
  const baseUrl = (process.env.PROOFRAILS_BASE_URL || "").trim();
  const apiKey = (process.env.PROOFRAILS_API_KEY || "").trim();

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON body",
        hint: "Send JSON with the tip fields.",
      },
      { status: 400 }
    );
  }

  if (!baseUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "PROOFRAILS_BASE_URL missing",
        hint: `Set PROOFRAILS_BASE_URL=http://localhost:8787 in .env.local then restart Next.js.`,
      },
      { status: 500 }
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "PROOFRAILS_API_KEY missing",
        hint: `Generate one from middleware:
POST http://localhost:8787/v1/public/api-keys
Then set PROOFRAILS_API_KEY in .env.local and restart Next.js.`,
      },
      { status: 500 }
    );
  }

  const tip = pickTip(body);

  const payload: TipInput = {
    tip_tx_hash: tip.tip_tx_hash?.toString().trim(),
    chain: tip.chain?.toString().trim(),
    amount: toStringAmount(tip.amount),
    currency: tip.currency?.toString().trim(),
    sender_wallet: tip.sender_wallet?.toString().trim(),
    receiver_wallet: tip.receiver_wallet?.toString().trim(),
    reference: tip.reference?.toString().trim(),
    callback_url: tip.callback_url ? String(tip.callback_url).trim() : undefined,
  };

  const missing = missingFields(payload);
  if (missing.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing required fields",
        missing,
        received: body,
        expectedShape: {
          tip_tx_hash: "0x...",
          chain: "coston2",
          amount: "0.01",
          currency: "C2FLR",
          sender_wallet: "0x...",
          receiver_wallet: "0x...",
          reference: "uuid-or-string",
        },
      },
      { status: 400 }
    );
  }

  // Correct endpoint (from your openapi.json):
  // POST /v1/iso/record-tip
  const url = `${baseUrl.replace(/\/$/, "")}/v1/iso/record-tip`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Could not reach ProofRails middleware",
        hint: `Confirm middleware is running and reachable at PROOFRAILS_BASE_URL.`,
        url,
        details: e?.message ?? String(e),
      },
      { status: 502 }
    );
  }

  const raw = await readRaw(res);

  if (!res.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "PROOFRAILS CREATE FAILED",
        httpStatus: res.status,
        httpStatusText: res.statusText,
        middlewareUrl: url,
        requestSent: payload,
        rawResponseText: raw.text,
        rawResponseJson: raw.json,
        tip: `Your middleware expects:
- header: x-api-key: <api key>
- POST ${url}

Common failures:
- 401: api key missing/invalid/revoked (regenerate from /v1/public/api-keys)
- 422: payload doesn't match TipRecordRequest
- 500: middleware failed during processing (check middleware logs)`,
      },
      { status: 502 }
    );
  }

  // Success — middleware returns { receipt_id, status }
  return NextResponse.json(
    {
      ok: true,
      receipt: raw.json ?? raw.text,
      middlewareUrl: url,
      requestSent: payload,
    },
    { status: 200 }
  );
}

