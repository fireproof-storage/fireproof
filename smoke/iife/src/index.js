import { fireproof } from 'http://localhost:4874/@fireproof/core'

const db = fireproof("iife-test");
const ok = await db.put({ sort: Math.random(), test: "iife-success" });

const label = document.querySelector('label')
label.innerHTML = `<pre>
	${JSON.stringify(await db.get(ok.id), null, 2)}
        </pre>`;
label.setAttribute("data-ready", "");
