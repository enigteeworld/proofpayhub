import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const baseUrl = process.env.PROOFRAILS_BASE_URL;
    const apiKey = process.env.PROOFRAILS_API_KEY;

    if (!baseUrl) {
      return NextResponse.json(
        { error: "Missing PROOFRAILS_BASE_URL in .env.local" },
        { status: 500 }
      );
    }
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing PROOFRAILS_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const receiptId = searchParams.get("receiptId");

    if (!receiptId) {
      return NextResponse.json({ error: "Missing receiptId" }, { status: 400 });
    }

    const res = await fetch(`${baseUrl}/v1/iso/receipts/${receiptId}`, {
      headers: {
        "X-API-Key": apiKey,
      },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        {
          error: data?.detail || data?.error || "ProofRails status failed",
          raw: data,
        },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}

