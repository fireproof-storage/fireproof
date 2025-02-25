import { JSX, useCallback, useEffect, useState } from "react";
import Editor from "react-simple-code-editor";

import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";

import "highlight.js/styles/stackoverflow-light.css";

hljs.registerLanguage("json", json);
hljs.registerLanguage("javascript", javascript);

function HighlightedCode({ code, language }: { code: string; language: string }) {
  const highlightedCode = hljs.highlight(code, { language }).value;
  return (
    <pre className={`language-${language} overflow-x-auto text-code`}>
      <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
    </pre>
  );
}
const codeStyle = {
  backgroundColor: "var(--fp-color-background-00)",
  border: "1px solid var(--fp-color-decorative-00)",
  borderRadius: "4px",
  overflowX: "auto",
};

export function CodeHighlight({ code, language = "json" }: { code: string; language?: string }): JSX.Element {
  return (
    <div className="p-2 text-code" style={codeStyle as React.CSSProperties}>
      <HighlightedCode code={code} language={language} />
    </div>
  );
}

export function EditableCodeHighlight({
  code,
  onChange,
  language = "json",
}: {
  code: string;
  language?: string;
  onChange: (args: { code: string; valid: boolean }) => void;
}) {
  const [liveCode, setCode] = useState(code);

  const onEditableChange = useCallback(
    (liveCode: string) => {
      if (language === "json") {
        try {
          liveCode = JSON.stringify(JSON.parse(liveCode), null, 2);
          onChange({ code: liveCode, valid: true });
        } catch (e) {
          onChange({ code: liveCode, valid: false });
        }
      } else {
        onChange({ code: liveCode, valid: true });
      }
      setCode(liveCode);
    },
    [language, onChange],
  );

  useEffect(() => {
    setCode(code);
  }, [code]);

  return (
    <Editor
      value={liveCode}
      onValueChange={onEditableChange}
      highlight={(code) => <HighlightedCode code={code} language={language} />}
      padding={10}
      style={codeStyle}
      autoFocus
      className="text-code"
    />
  );
}
