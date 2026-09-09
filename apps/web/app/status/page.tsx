import type { Metadata } from "next";
import { StatusDashboard } from "../../components/status-dashboard";

export const metadata: Metadata = { title: "System status" };

export default function StatusPage() {
  return <StatusDashboard />;
}
