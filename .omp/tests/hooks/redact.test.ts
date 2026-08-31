#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import { redact } from "../../hooks/post/redact";

type Case = [text: string, path: string | undefined, shouldRedact: boolean];

const CASES: Case[] = [
  // Real secrets in config/env context - must redact.
  ["DB_PASSWORD=hunter2xyz123", ".env", true],
  ['"API_KEY": "AbCdEfGh12345678"', "config.json", true],
  ["API_TOKEN='hunter2xyz123'", ".env", true],
  ["password: hunter2xyz123", "values.yaml", true],
  // Vendor-format signatures - must redact regardless of file type (source included).
  ["aws_key = AKIAIOSFODNN7EXAMPLE", "deploy.ts", true],
  ["Authorization: Bearer mySecretToken12345678", "server.py", true],
  ["-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0\n-----END RSA PRIVATE KEY-----", "id_rsa.pem", true],

  // Function calls assigned to secret-sounding keys must never be redacted
  ['password: resolveField(flags.password, envFileValues, "DB_PASSWORD"),', "sandbox.ts", false],
  ["function getPassword(user) { return user.password; }", "auth.py", false],

  // Source-code extensions skip generic keyword patterns
  ["SECRET_KEY: process.env.SECRET_KEY,", "settings.ts", false],
  ["apiKey: config.apiKey,", "client.ts", false],
  ["const authToken = req.headers.authorization;", "server.js", false],
  ['password: resolveField(flags.password, envFileValues, "DB_PASSWORD"),', undefined, false],

  // Metric count fields (tokens, max_tokens, etc.) in bash output & JSON logs - must not redact.
  ["turn_duration=2.58s | output_tokens=4848 | input_tokens=1200", undefined, false],
  ['"totalTokens": 25061, "promptTokens": 1234, "outputTokens": 999', undefined, false],
  ['"reasoningTokens": 154, "cacheReadTokens": 444, "nonMessageTokens": 555', undefined, false],
  ['"tokenCount": 555, "tokens": 500', undefined, false],
  ["max_tokens: 4096", undefined, false],
  ["total_tokens = 50000", undefined, false],
  // Config files with secret keys
  ["SECRET_KEY: process.env.SECRET_KEY,", "values.yaml", true],
];

describe("given redact post-hook, when scanning text across file contexts, then redact sensitive values and preserve safe content", () => {
  for (const [text, filePath, shouldRedact] of CASES) {
    it(`redact("${text.slice(0, 30)}...", path=${filePath ?? "none"}) -> ${shouldRedact}`, () => {
      const out = redact(text, filePath);
      const changed = out !== text;
      expect(changed).toBe(shouldRedact);
    });
  }
});
