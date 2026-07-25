// RFC 6238 TOTP, for local development only.
//
// This exists because reaching `aal2` needs a valid six-digit code and Supabase returns
// a factor's secret at enrolment, so a code can be produced without an authenticator
// app. It is used by `app/api/v1/dev/session/route.ts` and by the test helper — one
// implementation rather than two, since a drifting copy would fail in a way that looks
// like a Supabase problem.
//
// Nothing here belongs in a production build. The real login is Google OAuth with two
// TOTP factors enrolled from an authenticator app (`docs/PRODUCT_CHARTER.md`); the gate
// that matters, `private.has_strong_owner_access`, never inspects the auth provider,
// which is the only reason a local password session can stand in for it (D-020).

import { createHmac } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export function totp(secret: string, atMs: number = Date.now()): string {
  let bits = "";
  for (const character of secret.replace(/=+$/u, "").toUpperCase()) {
    const value = BASE32.indexOf(character);
    if (value < 0) continue;
    bits += value.toString(2).padStart(5, "0");
  }
  const key = Buffer.from((bits.match(/.{8}/gu) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / STEP_SECONDS)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code = digest.readUInt32BE(offset) & 0x7fffffff;
  return (code % 1_000_000).toString().padStart(6, "0");
}
