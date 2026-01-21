import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container">
      {/* ================= HERO ================= */}
      <section className="hero">
        <div className="heroGrid">
          {/* Main hero panel */}
          <div className="panel heroMain">
            {/* 3D background scene */}
            <div className="heroScene" aria-hidden="true">
              <div className="orb3d a" />
              <div className="orb3d b" />
              <div className="orb3d c" />
              <div className="grid3d" />
            </div>

            <div className="kicker">
              <span className="dot" />
              Live verifiable payments
            </div>

            <h1 className="h1">
              ProofPay Hub
              <br />
              receive payments with proof.
            </h1>

            <p className="lead">
              ProofPay Hub is a simple payment-proof system built on Flare testnet (Coston2).
              Create a payment link, receive a real onchain transaction, and share a public proof
              page that anyone can verify live using explorer links.
            </p>

            <div className="heroActions">
              <Link href="/pay/create" className="btn btn-primary">
                Create payment link
              </Link>

              <Link href="/about" className="btn">
                Learn more
              </Link>
            </div>

            <p className="muted" style={{ marginTop: 12 }}>
              Practical for freelancers, creators, small businesses, events, and communities.
            </p>
          </div>

          {/* Side info panel */}
          <div className="panel heroSide">
            <div className="sideTitle">Why ProofPay Hub</div>

            <div className="sideList">
              <div className="sideItem">
                <div className="sideHead">Public proof pages</div>
                <div className="sideText">
                  Every payment generates a clean, read-only proof link you can share anywhere.
                </div>
              </div>

              <div className="sideItem">
                <div className="sideHead">Live verification</div>
                <div className="sideText">
                  Payment tx and anchor tx hashes link directly to the Flare explorer.
                </div>
              </div>

              <div className="sideItem">
                <div className="sideHead">Built for real use</div>
                <div className="sideText">
                  Works like a modern receipt system, not just a crypto demo.
                </div>
              </div>

              <Link
                href="/pay/create"
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 6 }}
              >
                Start now
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="section">
        <h2 className="sectionTitle">Core features</h2>

        <div className="grid3">
          <div className="card">
            <div className="cardIcon">🧾</div>
            <div className="cardTitle">Create payment links</div>
            <div className="cardText">
              Generate an invoice with amount and memo, then share the link instantly.
            </div>
          </div>

          <div className="card">
            <div className="cardIcon">🦊</div>
            <div className="cardTitle">Get paid onchain</div>
            <div className="cardText">
              Payers connect MetaMask and send a real transaction on Coston2.
            </div>
          </div>

          <div className="card">
            <div className="cardIcon">🔎</div>
            <div className="cardTitle">Verify live</div>
            <div className="cardText">
              Proof pages include explorer links so anyone can verify payments instantly.
            </div>
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="section">
        <h2 className="sectionTitle">How it works</h2>

        <div className="grid3">
          <div className="card">
            <div className="cardIcon">1️⃣</div>
            <div className="cardTitle">Create a link</div>
            <div className="cardText">
              Set the amount and description. Share the invoice URL.
            </div>
          </div>

          <div className="card">
            <div className="cardIcon">2️⃣</div>
            <div className="cardTitle">Receive payment</div>
            <div className="cardText">
              The payer sends an onchain transaction. Confirmation is recorded automatically.
            </div>
          </div>

          <div className="card">
            <div className="cardIcon">3️⃣</div>
            <div className="cardTitle">Share proof</div>
            <div className="cardText">
              Send the public proof page showing tx hashes and verification links.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

