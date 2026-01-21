import Link from "next/link";

export default function FeatureCard({
  title,
  desc,
  icon,
  href,
  cta,
}: {
  title: string;
  desc: string;
  icon: string;
  href?: string;
  cta?: string;
}) {
  const inner = (
    <div className="card">
      <div className="card-icon">{icon}</div>
      <div className="card-title">{title}</div>
      <div className="muted">{desc}</div>
      {href && (
        <div style={{ marginTop: 12 }}>
          <span className="link">{cta ?? "Learn more →"}</span>
        </div>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="card-link">
      {inner}
    </Link>
  ) : (
    inner
  );
}

