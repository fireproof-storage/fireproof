import { fireproof } from 'https://esm.sh/@fireproof/core@0.19.114'
// import { fireproof } from './node_modules/@fireproof/core/index.js'


const db = fireproof("iife-test");
const ok = await db.put({ sort: Math.random(), test: "iife-success" });

self.label.innerHTML = (await db.get(ok.id)).test;
self.label.setAttribute("data-ready", "");
