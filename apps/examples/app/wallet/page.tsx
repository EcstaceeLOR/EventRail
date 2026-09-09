import Link from "next/link";
import { ExampleWidget } from "../example-widget";
export default function Wallet() {
  return (
    <main className="example">
      <div className="example-shell">
        <header className="example-head">
          <div>
            <span className="label">REFERENCE 01 / WALLET</span>
            <h1>Vault event terminal</h1>
          </div>
          <Link href="/">All examples ↗</Link>
        </header>
        <ExampleWidget mode="wallet" />
        <p className="proof">TESTNET PROOF · Winner-only redemption confirmed on Shannon: 0x29b9…0d595</p>
      </div>
    </main>
  );
}
