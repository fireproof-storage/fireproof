import { describe, it, expect } from "vitest";
import { triggerEvento } from "./evento-test-helper.js";
import { isResKey } from "./cloud-token-key-cmd.js";
import { isResWellKnown } from "./well-known-cmd.js";
import { isResWriteEnv } from "./write-env-cmd.js";
import { isResDeviceIdCreate } from "./device-id-cmd.js";
import { isResDeviceIdExport } from "./device-id-cmd.js";
import { isResRetry } from "./retry-cmd.js";

describe("evento pipeline", () => {
  describe("key --generatePair", () => {
    it("generates a key pair with public and secret env vars", async () => {
      const wmsg = await triggerEvento({
        reqType: "core-cli.key",
        raw: { generatePair: true, ourToJWK: "", JWKToour: "" },
      });
      const msg = wmsg.result;
      expect(isResKey(msg)).toBe(true);
      if (isResKey(msg)) {
        expect(msg.output).toContain("CLOUD_SESSION_TOKEN_PUBLIC=");
        expect(msg.output).toContain("CLOUD_SESSION_TOKEN_SECRET=");
      }
    });
  });

  describe("wellKnown", () => {
    it("returns JSON with keys array when given a presetKey", async () => {
      // Use a minimal valid JWK as presetKey
      const presetKey = JSON.stringify({
        kty: "EC",
        crv: "P-256",
        x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
        y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
        kid: "test-key-1",
      });
      const wmsg = await triggerEvento({
        reqType: "core-cli.req-well-known",
        raw: {
          json: true,
          jsons: false,
          pem: false,
          env: false,
          presetKey,
          envPrefix: "CLERK_PUB_JWT_KEY",
          urls: [],
        },
      });
      const msg = wmsg.result;
      expect(isResWellKnown(msg)).toBe(true);
      if (isResWellKnown(msg)) {
        const parsed = JSON.parse(msg.output);
        expect(parsed).toHaveProperty("keys");
        expect(Array.isArray(parsed.keys)).toBe(true);
        expect(parsed.keys.length).toBeGreaterThan(0);
        expect(parsed.keys[0].kid).toBe("test-key-1");
      }
    });
  });

  describe("writeEnv", () => {
    it("writes env vars to stdout when --out -", async () => {
      const wmsg = await triggerEvento({
        reqType: "core-cli.write-env",
        raw: {
          wranglerToml: "./wrangler.toml",
          env: "test",
          doNotOverwrite: false,
          excludeSecrets: false,
          fromEnv: ["HOME"],
          out: "-",
          json: false,
        },
      });
      const msg = wmsg.result;
      expect(isResWriteEnv(msg)).toBe(true);
      if (isResWriteEnv(msg)) {
        // output is the filename "-" for stdout
        expect(msg.output).toBe("-");
      }
    });
  });

  describe("deviceId create", () => {
    it("creates or finds a device ID with fingerprint", async () => {
      const wmsg = await triggerEvento({
        reqType: "core-cli.device-id-create",
        raw: { force: false },
      });
      const msg = wmsg.result;
      expect(isResDeviceIdCreate(msg)).toBe(true);
      if (isResDeviceIdCreate(msg)) {
        expect(msg.output).toContain("Fingerprint");
      }
    });
  });

  describe("deviceId export", () => {
    it("exports public key as JSON", async () => {
      // Ensure device ID exists first
      await triggerEvento({
        reqType: "core-cli.device-id-create",
        raw: { force: false },
      });

      const wmsg = await triggerEvento({
        reqType: "core-cli.device-id-export",
        raw: { private: false, json: true, public: true, cert: false },
      });
      const msg = wmsg.result;
      expect(isResDeviceIdExport(msg)).toBe(true);
      if (isResDeviceIdExport(msg)) {
        const parsed = JSON.parse(msg.output);
        expect(parsed).toHaveProperty("publicKey");
        expect(parsed.publicKey).toHaveProperty("kty");
      }
    });
  });

  describe("retry", () => {
    it("runs echo and succeeds with exitCode 0", async () => {
      const wmsg = await triggerEvento({
        reqType: "core-cli.retry",
        raw: { retry: 1, timeout: 0, command: ["echo", "hello"] },
      });
      const msg = wmsg.result;
      expect(isResRetry(msg)).toBe(true);
      if (isResRetry(msg)) {
        expect(msg.exitCode).toBe(0);
      }
    });
  });
});
