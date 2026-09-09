import Link from "next/link";
import { EVENTRAIL_THEMES } from "@eventrail/platform";
import { ExampleWidget } from "../example-widget";
export default function Community() {
  return (
    <main className="example community">
      <div className="example-shell">
        <header className="example-head">
          <div>
            <span className="label">REFERENCE 03 / COMMUNITY</span>
            <h1>Community pulse</h1>
          </div>
          <Link href="/">All examples ↗</Link>
        </header>
        <section className="conversation">
          <p>THE QUESTION THE ROOM IS TRADING</p>
          <ExampleWidget mode="community" theme={EVENTRAIL_THEMES.paper} />
        </section>
      </div>
    </main>
  );
}
