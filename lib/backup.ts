import { canonicalJson } from "@/lib/canonical";

const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type BackupHeader = {
  envelopeVersion: 1;
  kdf: "PBKDF2-HMAC-SHA-256";
  iterations: 600000;
  cipher: "AES-256-GCM";
};

export type EncryptedBackup = {
  header: BackupHeader;
  salt: string;
  nonce: string;
  ciphertext: string;
};

const HEADER: BackupHeader = Object.freeze({
  envelopeVersion: 1,
  kdf: "PBKDF2-HMAC-SHA-256",
  iterations: ITERATIONS,
  cipher: "AES-256-GCM"
});

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function unbase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (password.length < 12) throw new Error("Backup password must contain at least 12 characters.");
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function transform(bytes: Uint8Array<ArrayBuffer>, format: "gzip", decompress = false) {
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
  const stream = source.pipeThrough(decompress ? new DecompressionStream(format) : new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encryptBackup(value: unknown, password: string): Promise<EncryptedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const compressed = await transform(encoder.encode(canonicalJson(value)), "gzip");
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: encoder.encode(canonicalJson(HEADER)), tagLength: 128 },
    key,
    compressed
  );
  return { header: HEADER, salt: base64(salt), nonce: base64(nonce), ciphertext: base64(new Uint8Array(ciphertext)) };
}

export async function decryptBackup(envelope: EncryptedBackup, password: string): Promise<unknown> {
  if (canonicalJson(envelope.header) !== canonicalJson(HEADER)) throw new Error("Unsupported or altered backup header.");
  const salt = unbase64(envelope.salt);
  const nonce = unbase64(envelope.nonce);
  if (salt.byteLength !== 16 || nonce.byteLength !== 12) throw new Error("Invalid backup salt or nonce.");
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, additionalData: encoder.encode(canonicalJson(HEADER)), tagLength: 128 },
    key,
    unbase64(envelope.ciphertext)
  );
  const decompressed = await transform(new Uint8Array(plaintext), "gzip", true);
  return JSON.parse(decoder.decode(decompressed)) as unknown;
}
