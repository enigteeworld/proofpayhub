import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <div className="footer-title">ProofPay Hub</div>
          <div className="muted">
            Shareable payment proofs anchored on Flare testnet.
          </div>
        </div>

        <div className="footer-links">
          <Link href="/" className="footer-link">Home</Link>
          <Link href="/pay/create" className="footer-link">Create Invoice</Link>
          <Link href="/about" className="footer-link">About</Link>
        </div>

        <div className="muted" style={{ textAlign: "right" }}>
          Built for Flare testnet (Coston2)
        </div>
      </div>
    </footer>
  );
}

