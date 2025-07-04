import React from "react";
import { useEffect, useRef } from "react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";

import "highlight.js/styles/github.css";
import { TenantLedger } from "@fireproof/core-types/protocols/cloud";

// Then register the languages you need
hljs.registerLanguage("javascript", javascript);

export interface SelectedTenantLedgerProps {
  readonly dbName: string;
  readonly cloudToken: string;
  readonly tenantAndLedger: TenantLedger;
}

export function SelectedTenantLedger(props: SelectedTenantLedgerProps) {
  const codeRef = useRef(null);
  const jsCode = `const { database } = useFireproof("${props.dbName}", {
    attach: toCloud({
      tenant: "${props.tenantAndLedger.tenant}",
      ledger: "${props.tenantAndLedger.ledger}",
    }),
  });`;

  useEffect(() => {
    if (codeRef.current) {
      hljs.highlightElement(codeRef.current);
    }
  }, [jsCode]);

  return (
    <>
      <h2>Code Preset</h2>
      <pre>
        <code ref={codeRef} className="language-js">
          {jsCode}
        </code>
      </pre>
      <h2>Token</h2>
      <b>
        <pre>{props.cloudToken}</pre>
      </b>
    </>
  );
}
