import { ImportBench } from "@/app/import-bench";

export const metadata = { title: "Import · Private Ledger" };

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return <ImportBench />;
}
