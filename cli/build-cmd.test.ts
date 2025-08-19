import { getVersion } from "./build-cmd.js";
import { expect, it } from "vitest";

it("getVersion emptyString", async () => {
  expect(await getVersion("")).toContain("0.0.0-smoke");
});

it("getVersion file with v", async () => {
  expect(
    await getVersion("wurst", {
      existsSync: () => true,
      readFile: (_x: string, _y = "utf-8") => Promise.resolve("v0.0.48-smoke"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
  ).toContain("0.0.48-smoke");
});

it("getVersion file without ", async () => {
  expect(
    await getVersion("wurst", {
      existsSync: () => true,
      readFile: (_x: string, _y = "utf-8") => Promise.resolve("0.0.48-smoke"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
  ).toContain("0.0.48-smoke");
});

it("getVersion file with scope", async () => {
  expect(
    await getVersion("wurst", {
      existsSync: () => true,
      readFile: (_x: string, _y = "utf-8") => Promise.resolve("wost@0.0.48-smoke"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
  ).toContain("0.0.48-smoke");
});

it("getVersion file with scope and v", async () => {
  expect(
    await getVersion("wurst", {
      existsSync: () => true,
      readFile: (_x: string, _y = "utf-8") => Promise.resolve("wost@v0.0.48-smoke"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
  ).toContain("0.0.48-smoke");
});

it("getVersion file with ref", async () => {
  expect(
    await getVersion("wurst", {
      existsSync: () => true,
      readFile: (_x: string, _y = "utf-8") => Promise.resolve("d/d/wost@0.0.48-smoke"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
  ).toContain("0.0.48-smoke");
});

it("getVersion with v", async () => {
  process.env.GITHUB_REF = "v0.0.8-smoke";
  expect(await getVersion()).toContain("0.0.8-smoke");
});

it("getVersion with scope and v", async () => {
  process.env.GITHUB_REF = "blub@v0.0.8-smoke";
  expect(await getVersion()).toContain("0.0.8-smoke");
});

it("getVersion with scope and no v", async () => {
  process.env.GITHUB_REF = "blub@0.0.8-smoke";
  expect(await getVersion()).toContain("0.0.8-smoke");
});

it("getVersion without", async () => {
  process.env.GITHUB_REF = "0.0.9-smoke";
  expect(await getVersion()).toContain("0.0.9-smoke");
});

it("getVersion ref without", async () => {
  process.env.GITHUB_REF = "v0.0.9-smoke";
  expect(await getVersion()).toContain("0.0.9-smoke");
});

it("getVersion ref with v", async () => {
  process.env.GITHUB_REF = "a/ref/v0.0.8-smoke";
  expect(await getVersion()).toContain("0.0.8-smoke");
});

it("getVersion ref with scope and v", async () => {
  process.env.GITHUB_REF = "a/ref/blub@v0.0.8-smoke";
  expect(await getVersion()).toContain("0.0.8-smoke");
});

it("getVersion ref with scope and no v", async () => {
  process.env.GITHUB_REF = "a/ref/blub@0.0.8-smoke";
  expect(await getVersion()).toContain("0.0.8-smoke");
});

it("getVersion ref without", async () => {
  process.env.GITHUB_REF = "a/ref/0.0.9-smoke";
  expect(await getVersion()).toContain("0.0.9-smoke");
});
