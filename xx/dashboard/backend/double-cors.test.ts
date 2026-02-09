import { expect, it } from "vitest";
import { DefaultHttpHeaders } from "./create-handler.js";

it("adds CORS headers only once", async () => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  const x = new Response("Var", {
    status: 400,
    statusText: "Bad Request",
    headers: DefaultHttpHeaders(CORS),
  });

  expect(x.headers.get("Access-Control-Allow-Origin")).toBe("*");
});
