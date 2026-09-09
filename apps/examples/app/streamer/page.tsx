import Link from "next/link";
import { EVENTRAIL_THEMES } from "@eventrail/platform";
import { ExampleWidget } from "../example-widget";
export default function Streamer() {
  return (
    <main className="example streamer">
      <div className="example-shell">
        <header className="example-head">
          <div>
            <span className="label">REFERENCE 02 / STREAMER</span>
            <h1>Live audience call</h1>
          </div>
          <Link href="/">All examples ↗</Link>
        </header>
        <div className="streamer-frame">
          <ExampleWidget mode="streamer" theme={EVENTRAIL_THEMES.signal} />
        </div>
      </div>
    </main>
  );
}
