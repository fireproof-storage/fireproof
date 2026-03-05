// Usage: tsx alchemy/alchemy.verify.ts <cloud-backend-url> <dashboard-url>
const [backendUrl, dashboardUrl] = process.argv.slice(2);

if (!backendUrl || !dashboardUrl) {
  console.error("Usage: tsx alchemy/alchemy.verify.ts <cloud-backend-url> <dashboard-url>");
  process.exit(1);
}

async function verify() {
  const results: { name: string; pass: boolean; detail: string }[] = [];

  // 1. Cloud backend health
  const health = await fetch(`${backendUrl}/health`);
  results.push({
    name: "cloud-backend /health",
    pass: health.ok,
    detail: await health.text(),
  });

  // 2. Blob PUT + GET + DELETE
  const testKey = `verify-${Date.now()}`;
  const testData = new Uint8Array([1, 2, 3, 4]);
  const putRes = await fetch(`${backendUrl}/blob/${testKey}`, {
    method: "PUT",
    body: testData,
  });
  results.push({ name: "blob PUT", pass: putRes.ok, detail: `${putRes.status}` });

  const getRes = await fetch(`${backendUrl}/blob/${testKey}`);
  const blob = new Uint8Array(await getRes.arrayBuffer());
  results.push({
    name: "blob GET",
    pass: getRes.ok && blob.length === testData.length,
    detail: `${getRes.status}, ${blob.length} bytes`,
  });

  await fetch(`${backendUrl}/blob/${testKey}`, { method: "DELETE" });
  const gone = await fetch(`${backendUrl}/blob/${testKey}`);
  results.push({ name: "blob DELETE", pass: gone.status === 404, detail: `${gone.status}` });

  // 3. Dashboard loads (returns HTML)
  const dashRes = await fetch(dashboardUrl);
  const dashHtml = await dashRes.text();
  results.push({
    name: "dashboard loads",
    pass: dashRes.ok && dashHtml.includes("</html>"),
    detail: `${dashRes.status}, ${dashHtml.length} chars`,
  });

  // 5. Dashboard JWKS endpoint
  const jwks = await fetch(`${dashboardUrl}/.well-known/jwks.json`);
  results.push({
    name: "dashboard /.well-known/jwks.json",
    pass: jwks.ok,
    detail: `${jwks.status}`,
  });

  // Print results
  console.log("\n=== Verification Results ===\n");
  let allPass = true;
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`[${icon}] ${r.name} -- ${r.detail}`);
    if (!r.pass) allPass = false;
  }
  console.log(allPass ? "\nAll checks passed." : "\nSome checks failed.");
  process.exit(allPass ? 0 : 1);
}

verify();
