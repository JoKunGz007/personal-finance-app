import { redirect } from "next/navigation";

// The ledger is what this app is for on an ordinary day, so `/` is it. A redirect rather
// than a copy of the route, so there is one canonical URL per surface and nothing to keep
// in step (PLAN task 19).
export default function Home() {
  redirect("/ledger");
}
