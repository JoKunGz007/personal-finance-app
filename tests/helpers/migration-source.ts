import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/**
 * The body of the newest migration's definition of `public.<name>` — what a reset or `db push`
 * installs — for drift tests that hold SQL constants to their TS twins without a database.
 */
export function newestFunctionBody(name: string): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort().reverse();
  const header = new RegExp(`create (?:or replace )?function public\\.${name}\\(`, "u");
  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS, file), "utf8");
    const start = text.search(header);
    if (start < 0) continue;
    const open = text.indexOf("$$", start);
    const close = text.indexOf("$$", open + 2);
    return { file, body: text.slice(open + 2, close) };
  }
  throw new Error(`No migration defines public.${name}.`);
}
