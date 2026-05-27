/**
 * 凭证对称加密：AES-256-GCM。
 * 主密钥 CREDENTIAL_MASTER_KEY 从 env 读取，要求 base64 编码后正好 32 字节。
 *
 * 密文格式：base64(iv):base64(authTag):base64(ciphertext)
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.CREDENTIAL_MASTER_KEY;
  if (!raw) {
    throw new Error("CREDENTIAL_MASTER_KEY is not set");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `CREDENTIAL_MASTER_KEY must decode to 32 bytes (got ${buf.length})`,
    );
  }
  cachedKey = buf;
  return buf;
}

export function encryptJson<T = unknown>(value: T): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptJson<T = unknown>(payload: string): T {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("invalid encrypted payload");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
