export {};

const db = Fireproof.fireproof("iife-test");
const ok = await db.put({ sort: Math.random(), test: "iife-success" });

self.label.innerHTML = (await db.get(ok.id)).test;
self.label.setAttribute("data-ready", "");
