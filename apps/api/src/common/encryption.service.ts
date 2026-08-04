import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * AES-256-GCM envelope for tokens at rest. Ciphertext is stored as
 * base64(iv):base64(authTag):base64(ciphertext) so a single string column
 * is enough; encKeyVersion on the row lets us rotate KEY_ENCRYPTION_KEY later.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const keyB64 = config.getOrThrow<string>("KEY_ENCRYPTION_KEY");
    this.key = Buffer.from(keyB64, "base64");
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, ciphertextB64] = payload.split(":");
    if (!ivB64 || !tagB64 || !ciphertextB64) {
      throw new Error("Malformed encrypted payload");
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  }
}
