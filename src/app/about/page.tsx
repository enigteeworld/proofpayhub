import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="container">
      <div className="hero-panel" style={{ marginTop: 10 }}>
        <h1 className="hero-title" style={{ fontSize: 34 }}>
          About ProofPay Hub
        </h1>

        <p className="hero-sub">
          ProofPay Hub is a simple, modern proof-of-payment system designed for real-world use
          cases: small businesses, merchants, communities, and hackathon demos.
          It turns payments into verifiable, shareable proof links and anchors proofs on Flare
          testnet for integrity.
        </p>

        <div className="section" style={{ marginTop: 16 }}>
          <h2 className="section-title">Core features</h2>
          <div className="grid">
            <div className="card">
              <div className="card-title">Invoices</div>
              <div className="muted">
                Create payment requests with amounts and a payee address.
              </div>
            </div>
            <div className="card">
              <div className="card-title">Onchain payments</div>
              <div className="muted">
                MetaMask payments on Flare testnet, with tx hash stored in Supabase.
              </div>
            </div>
            <div className="card">
              <div className="card-title">Proof links</div>
              <div className="muted">
                Each payment generates a public proof page with explorer verification links.
              </div>
            </div>
          </div>
        </div>

        <div className="hero-actions" style={{ marginTop: 16 }}>
          <Link href="/pay/create" className="btn btn-primary">
            Create Invoice
          </Link>
          <Link href="/" className="btn">
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}

