import { useState, useCallback, useEffect } from "react";
import Editor from "react-simple-code-editor";
import hljs from "highlight.js";
import "highlight.js/styles/tokyo-night-dark.css";
import json from "highlight.js/lib/languages/json";
hljs.registerLanguage("json", json);

function HighlightedCode({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const highlightedCode = hljs.highlight(code, { language }).value;
  console.log(highlightedCode);
  return (
    <pre className={`language-${language}`}>
      <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
    </pre>
  );
}
const codeStyle = {
  fontFamily: '"Fira code", "Fira Mono", monospace',
  fontSize: 14,
};
export function CodeHighlight({
  code,
  language = "json",
}: {
  code: string;
  language?: string;
}): JSX.Element {
  return (
    <div className="p-2" style={codeStyle}>
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
    <div className="p-2">
      <Editor
        value={liveCode}
        onValueChange={onEditableChange}
        highlight={(code) => (
          <HighlightedCode code={code} language={language} />
        )}
        padding={10}
        style={codeStyle}
      />
    </div>
  );
}
