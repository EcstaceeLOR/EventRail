import Link from "next/link";

export default function NotFound() {
  return <section className="section-wrap not-found"><span className="eyebrow">404 / Signal lost</span><h1>That market left the rail.</h1><p>It may have rolled over, resolved, or never existed.</p><Link className="primary-button" href="/markets">Return to markets</Link></section>;
}
