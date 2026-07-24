import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

// Multi-session coverage for the owner mutation advisory lock.
//
// Every ledger-mutating RPC takes pg_advisory_xact_lock(hashtextextended(
// owner || ':ledger-mutation', 0)) so one owner's mutations serialize. pgTAP
// cannot test this: its tests run in a single session inside one transaction, and
// a session that already holds an advisory lock re-acquires it without blocking,
// so a single-session test passes whether or not the lock does anything. Proving
// it requires two real connections contending for the same key.
const CONTAINER = "supabase_db_private-ledger-local";
const OWNER_A = "11111111-2222-4333-8444-555555555555";
const OWNER_B = "99999999-8888-4777-8666-555555555555";
const HOLDER_NAME = "ledger-lock-holder";

const lockKey = (owner: string) => `hashtextextended('${owner}' || ':ledger-mutation', 0)`;

function psql(sql: string): { ok: boolean; output: string } {
  try {
    const output = execFileSync(
      "docker",
      ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    );
    return { ok: true, output };
  } catch (error) {
    const shell = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${shell.stdout ?? ""}${shell.stderr ?? ""}` };
  }
}

const reachable = psql("select 1;").ok;

// Synchronous wait without spawning anything; docker exec costs about a second per
// call, which made polling dominate the run.
function pause(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

// Holds the lock in its own connection. Tagged so it can be found and terminated
// from SQL: killing the local `docker exec` process does not stop psql inside the
// container, which would leak the lock into later tests.
//
// The SQL is passed as an argument rather than on stdin. Writing to a spawned
// child's stdin needs the event loop, and these tests block it synchronously while
// polling, so a piped write would never flush and psql would sit with no input.
function holdLock(owner: string): ChildProcess {
  const child = spawn(
    "docker",
    ["exec", "-e", `PGAPPNAME=${HOLDER_NAME}`, CONTAINER,
      "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
      "-c", `begin; select pg_advisory_xact_lock(${lockKey(owner)}); select pg_sleep(20); commit;`],
    { stdio: ["ignore", "ignore", "ignore"] }
  );
  child.on("error", () => {});
  return child;
}

function terminateHolders(): void {
  psql(`select pg_terminate_backend(pid) from pg_stat_activity where application_name = '${HOLDER_NAME}';`);
}

// Counts advisory locks granted to the holder session, avoiding any reconstruction
// of the bigint key from pg_locks classid/objid.
function holderHasLock(): boolean {
  const held = psql(
    `select count(*) from pg_locks l join pg_stat_activity a using (pid)
     where l.locktype = 'advisory' and l.granted and a.application_name = '${HOLDER_NAME}';`
  );
  return held.ok && held.output.trim() !== "0";
}

function waitForLock(attempts = 50): boolean {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (holderHasLock()) return true;
    pause(100);
  }
  return false;
}

// Tries to take the lock with a short timeout: real contention surfaces as 55P03
// lock_not_available rather than hanging the run.
function tryAcquire(owner: string): { ok: boolean; output: string } {
  return psql(`set lock_timeout = '1s'; begin; select pg_advisory_xact_lock(${lockKey(owner)}); rollback;`);
}

let holder: ChildProcess | null = null;

afterEach(() => {
  holder?.kill();
  holder = null;
  terminateHolders();
});

describe.skipIf(!reachable)("owner mutation advisory lock under real contention", () => {
  it("blocks a second session mutating the same owner's ledger", () => {
    holder = holdLock(OWNER_A);
    expect(waitForLock(), "holder never acquired the lock").toBe(true);

    const contender = tryAcquire(OWNER_A);
    expect(contender.ok, "a second session acquired the same owner's lock").toBe(false);
    expect(contender.output).toMatch(/55P03|lock timeout|canceling statement/iu);
  });

  it("does not block a different owner", () => {
    holder = holdLock(OWNER_A);
    expect(waitForLock()).toBe(true);

    // The distinguishing case: if the key were global rather than per-owner, this
    // would time out exactly like the same-owner contender above.
    expect(tryAcquire(OWNER_B).ok, "a different owner was blocked by the lock").toBe(true);
  });

  it("releases the lock when the holding transaction ends", () => {
    holder = holdLock(OWNER_A);
    expect(waitForLock()).toBe(true);
    expect(tryAcquire(OWNER_A).ok).toBe(false);

    // pg_advisory_xact_lock is transaction-scoped, so ending the holding backend
    // must free it with no explicit unlock.
    terminateHolders();
    let freed = false;
    for (let attempt = 0; attempt < 50 && !freed; attempt += 1) {
      freed = tryAcquire(OWNER_A).ok;
      if (!freed) pause(100);
    }
    expect(freed, "the lock was not released when the holding session ended").toBe(true);
  });
});

it.skipIf(reachable)("reports that advisory lock contention was not verified", () => {
  console.warn(
    `Skipped owner mutation advisory lock contention: container ${CONTAINER} is unreachable. ` +
    "Run `pnpm supabase:start` to exercise it — a skipped run proves nothing about serialization."
  );
  expect(reachable).toBe(false);
});
