"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = [
    { href: "/", label: "Home" },
    { href: "/pay/create", label: "Create Invoice" },
    { href: "/about", label: "About" },
  ];

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand">
          <span className="brand-dot" />
          <span className="brand-text">ProofPay Hub</span>
        </Link>

        <nav className="nav-links">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? "active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="nav-right">
          <ThemeToggle />

          <Link href="/pay/create" className="btn btn-primary hideOnMobile">
            Create a proof link
          </Link>

          <button className="iconBtn showOnMobile" onClick={() => setOpen((v) => !v)} 
aria-label="Menu">
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {open && (
        <div className="mobileMenu">
          <div className="container mobileMenuInner">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`mobileLink ${active ? "active" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}

            <Link href="/pay/create" className="btn btn-primary" style={{ width: "100%", marginTop: 10 
}}>
              Create a proof link
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

