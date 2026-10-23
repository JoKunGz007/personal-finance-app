import { describe, expect, it } from "vitest";
import { BACKUP_SCHEMA_VERSION, SUPPORTED_BACKUP_SCHEMA_VERSIONS, backupTableKindsFor } from "@/lib/backup-contract";
import { newestFunctionBody } from "./helpers/migration-source";

// D-297: `restore_backup` (SQL) and `lib/backup-contract.ts` (TS) each hold the list of backup
// versions and each version's tables, by hand. This reads the newest migration that defines the
// function — what a reset or `db push` installs — and checks the two agree, with no database.
// It parses the function's own layout: if a rewrite changes that layout, this fails loudly
// rather than passing on nothing.

const words = (list: string) => [...list.matchAll(/'([a-z_]+)'/gu)].map((match) => match[1]!);

function sqlContract(body: string) {
  const allow = /v_schema_text not in \(([^)]*)\)/u.exec(body);
  const base = /v_base_kinds text\[\]:=array\[([^\]]*)\]/u.exec(body);
  if (!allow || !base) throw new Error("restore_backup no longer has the allowlist or base kinds this test reads.");
  const steps = [...body.matchAll(/if v_schema>=(\d+) then v_expected_kinds:=v_expected_kinds\|\|array\[([^\]]*)\]; end if;/gu)]
    .map((match) => ({ from: Number(match[1]), kinds: words(match[2]!) }));
  if (steps.length === 0) throw new Error("restore_backup no longer has the per-version ladder this test reads.");
  const versions = [...allow[1]!.matchAll(/'(\d+)'/gu)].map((match) => Number(match[1]));
  const kindsFor = (version: number) => [...words(base[1]!), ...steps.filter((step) => version >= step.from).flatMap((step) => step.kinds)];
  return { versions, kindsFor };
}

describe("restore_backup agrees with lib/backup-contract.ts", () => {
  const { file, body } = newestFunctionBody("restore_backup");
  const sql = sqlContract(body);

  it(`accepts exactly the supported versions (${file})`, () => {
    expect(sql.versions).toEqual([...SUPPORTED_BACKUP_SCHEMA_VERSIONS]);
    expect(sql.versions.at(-1)).toBe(BACKUP_SCHEMA_VERSION);
  });

  it("expects the same tables, in the same order, for every supported version", () => {
    for (const version of SUPPORTED_BACKUP_SCHEMA_VERSIONS) {
      expect({ version, kinds: sql.kindsFor(version) }).toEqual({ version, kinds: [...backupTableKindsFor(version)] });
    }
  });
});
