/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useEffect } from "react";
import Editor from "react-simple-code-editor";
import hljs from 'highlight.js';
import json from 'highlight.js/lib/languages/json';
hljs.registerLanguage('json', json);

function HighlightedCode({ code, language }: { code: string, language: string }) {
  const highlightedCode = hljs.highlight(code, { language }).value;
  return (
    <pre className={`language-${language}`}>
      <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
    </pre>
  );
}

export function CodeHighlight({ code, language = "json" }: any) {
  return (
    <div className="p-2">
      <HighlightedCode code={code} language={language} />
    </div>
  );
}

export function EditableCodeHighlight({ code, onChange, language = "json" }: any) {
  const [liveCode, setCode] = useState(code);

  const onEditableChange = useCallback(
    (liveCode: string) => {
      let setThisCode = liveCode.slice(0, -1);
      if (language === "json") {
        try {
          setThisCode = JSON.stringify(JSON.parse(liveCode), null, 2);
          onChange({ code: setThisCode, valid: true });
        } catch (e) {
          onChange({ code: setThisCode, valid: false });
        }
      } else {
        onChange({ code: setThisCode, valid: true });
      }
      setCode(setThisCode);
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
        highlight={code => (
          <HighlightedCode code={code} language={language} />
        )}
        padding={10}
        style={{
          fontFamily: '"Fira code", "Fira Mono", monospace',
          fontSize: 12,
        }}
      />
    </div>
  );
}
