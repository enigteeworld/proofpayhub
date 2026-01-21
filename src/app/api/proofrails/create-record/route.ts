import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { proofSlug, recordType } = body as { proofSlug: string; recordType?: string };

    if (!proofSlug) {
      return NextResponse.json({ error: "Missing proofSlug" }, { status: 400 });
    }

    // 1) Load proof
    const { data: proof, error: proofErr } = await supabase
      .from("proofs")
      .select("id,payment_id,public_slug")
      .eq("public_slug", proofSlug)
      .single();

    if (proofErr || !proof) throw proofErr ?? new Error("Proof not found");

    // 2) Load payment (so later we can build the ISO record from real tx)
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .select("*")
      .eq("id", proof.payment_id)
      .single();

    if (payErr || !payment) throw payErr ?? new Error("Payment not found");

    // 3) SIMULATED ProofRails + anchoring response (replace later with real API call)
    const simulatedRecordId = `PR_SIM_${crypto.randomUUID()}`;
    const simulatedAnchorRef = `FLARE_ANCHOR_SIM_${crypto.randomUUID()}`;

    // 4) Save to proofs table
    const { error: updErr } = await supabase
      .from("proofs")
      .update({
        proofrails_record_type: recordType ?? "pacs",
        proofrails_record_id: simulatedRecordId,
        anchored_on_flare: true,
        flare_anchor_ref: simulatedAnchorRef,
      })
      .eq("id", proof.id);

    if (updErr) throw updErr;

    return NextResponse.json({
      ok: true,
      proofSlug,
      proofrails_record_type: recordType ?? "pacs",
      proofrails_record_id: simulatedRecordId,
      flare_anchor_ref: simulatedAnchorRef,
      anchored_on_flare: true,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

