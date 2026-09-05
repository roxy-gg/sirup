import crypto from "node:crypto";
import { config } from "../config.js";

const VERSION = "v1";

function encryptionKey(): Buffer {
  if (!config.credentialEncryptionKey) {
    throw new Error("OAuth credential encryption is not configured.");
  }
  return config.credentialEncryptionKey;
}

/** AES-256-GCM envelope. The context binds ciphertext to its row and purpose. */
export function encryptSecret(value: unknown, context: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));

  const json = JSON.stringify(value);
  if (json === undefined) throw new Error("Cannot encrypt an undefined value.");
  const plaintext = Buffer.from(json, "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptSecret<T>(envelope: string, context: string): T {
  const [version, ivValue, tagValue, ciphertextValue] = envelope.split(".");
  if (
    version !== VERSION ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue
  ) {
    throw new Error("Invalid encrypted credential envelope.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function randomOAuthState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashOAuthState(state: string): string {
  return crypto.createHash("sha256").update(state).digest("hex");
}
