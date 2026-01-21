// src/app/api/proofrails/receipt/[receiptId]/route.ts
import { NextResponse } from "next/server";

function cleanBaseUrl(v: string) {
  return (v || "").trim().replace(/\/$/, "");
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null as any };
  }
}

function extractReceiptIdFromPath(reqUrl: string) {
  // Example pathname: /api/proofrails/receipt/04531b11-...
  const pathname = new URL(reqUrl).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  // If someone hits /api/proofrails/receipt (no id), last would be "receipt"
  if (!last || last.toLowerCase() === "receipt") return "";
  return last;
}

export async function GET(req: Request, context: any) {
  const baseUrl = cleanBaseUrl(process.env.PROOFRAILS_BASE_URL || "");

  // 1) Prefer Next params
  const fromParams = (context?.params?.receiptId || "").toString().trim();

  // 2) Fallback: parse from URL (handles cases where params don't come through)
  const fromPath = extractReceiptIdFromPath(req.url);

  const receiptId = fromParams || fromPath;

  if (!receiptId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing receiptId",
        debug: {
          fromParams,
          fromPath,
          url: req.url,
          hint: "Expected /api/proofrails/receipt/<receiptId>",
        },
      },
      { status: 400 }
    );
  }

  if (!baseUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "PROOFRAILS_BASE_URL missing",
        hint: "Set PROOFRAILS_BASE_URL=http://localhost:8787 in .env.local then restart Next.js",
      },
      { status: 500 }
    );
  }

  const receiptApiUrl = `${baseUrl}/v1/iso/receipts/${receiptId}`;
  const messagesApiUrl = `${baseUrl}/v1/iso/messages/${receiptId}`;
  const publicReceiptUrl = `${baseUrl}/receipt/${receiptId}`;

  try {
    // Receipt
    const r1 = await fetch(receiptApiUrl, { cache: "no-store" });
    const raw1 = await safeJson(r1);

    if (!r1.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to load receipt from middleware",
          httpStatus: r1.status,
          httpStatusText: r1.statusText,
          receiptId,
          baseUrl,
          middlewareUrl: receiptApiUrl,
          rawResponseText: raw1.text,
          rawResponseJson: raw1.json,
        },
        { status: 502 }
      );
    }

    // Messages (optional)
    const r2 = await fetch(messagesApiUrl, { cache: "no-store" });
    const raw2 = await safeJson(r2);

    const receipt = raw1.json ?? null;
    const record = r2.ok ? raw2.json ?? null : null;

    const xml_url =
      receipt?.xml_url && typeof receipt.xml_url === "string" ? `${baseUrl}${receipt.xml_url}` : null;

    const bundle_url =
      receipt?.bundle_url && typeof receipt.bundle_url === "string" ? `${baseUrl}${receipt.bundle_url}` : null;

    return NextResponse.json(
      {
        ok: true,
        baseUrl,
        receipt,
        record,
        links: {
          receiptUrl: publicReceiptUrl,
          xml_url,
          bundle_url,
          receipt_json_url: `${baseUrl}/files/${receiptId}/receipt.json`,
          tip_json_url: `${baseUrl}/files/${receiptId}/tip.json`,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Could not reach middleware",
        receiptId,
        baseUrl,
        details: e?.message ?? String(e),
      },
      { status: 502 }
    );
  }
}

