import { DashboardClient } from "./dashboard-client";

export default function HomePage() {
  return <DashboardClient chatwootAppUrl={process.env.CHATWOOT_APP_URL ?? "#"} />;
}
