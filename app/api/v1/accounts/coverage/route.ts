import { logMailSyncFailure } from "@/lib/server/mail-sync-log";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

type CoverageRow = {
  account_id: string;
  newest_date: string | null;
  newest_time: string | null;
  last_statement_mail_at: string | null;
};

// How far each account's stored rows reach, when the mail carrying its latest statement arrived, and
// when the mailbox was last synced (migration 064). Dates and times pass through as the database wrote them.
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const coverage = await auth.supabase.rpc("list_account_coverage");
  if (coverage.error) {
    logMailSyncFailure("accounts/coverage", "read", 400, coverage.error);
    return routeError("Account coverage could not be loaded.", 400);
  }
  const sync = await auth.supabase
    .from("mail_sync_runs")
    .select("finished_at,complete")
    .order("finished_at", { ascending: false })
    .limit(1);
  if (sync.error) {
    logMailSyncFailure("accounts/coverage", "read", 400, sync.error);
    return routeError("Account coverage could not be loaded.", 400);
  }

  const last = sync.data?.[0] as { finished_at: string; complete: boolean } | undefined;
  return Response.json({
    accounts: ((coverage.data ?? []) as CoverageRow[]).map((row) => ({
      accountId: row.account_id,
      newestDate: row.newest_date,
      newestTime: row.newest_time,
      lastStatementMailAt: row.last_statement_mail_at
    })),
    lastSync: last ? { finishedAt: last.finished_at, complete: last.complete } : null
  }, { headers: noStoreHeaders });
}
