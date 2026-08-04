const REQUIRED_VARS = [
  "DATABASE_URL",
  "REDIS_URL",
  "SESSION_SECRET",
  "KEY_ENCRYPTION_KEY",
] as const;

export function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED_VARS.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. Copy .env.example to .env and fill them in.`,
    );
  }

  const keyB64 = String(config.KEY_ENCRYPTION_KEY);
  const keyBytes = Buffer.from(keyB64, "base64");
  if (keyBytes.length !== 32) {
    throw new Error(
      "KEY_ENCRYPTION_KEY must decode to exactly 32 bytes (base64). Generate one with: openssl rand -base64 32",
    );
  }

  return config;
}
