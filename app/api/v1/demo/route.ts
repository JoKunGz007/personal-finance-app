import { syntheticImport } from "@/lib/synthetic";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(syntheticImport, { headers: { "Cache-Control": "no-store" } });
}
