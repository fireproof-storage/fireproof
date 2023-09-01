/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState, useCallback, useEffect } from 'react'
import Highlight, { defaultProps } from 'prism-react-renderer'
import { useEditable } from 'use-editable'

export function CodeHighlight({ code, theme, language = 'json' }: any) {
  // const editorRef = useRef(null)

  return (
    <div className="p-2">
      <Highlight
        {...defaultProps}
        theme={theme || defaultProps.theme}
        code={code}
        language={language}
      >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <code>
            <pre className={className + ' p-2'} style={style}>
              {tokens.map((line, i) => (
                <div {...getLineProps({ line, key: i })}>
                  {line.map((token, key) => (
                    <span {...getTokenProps({ token, key })} />
                  ))}
                </div>
              ))}
            </pre>
          </code>
        )}
      </Highlight>
    </div>
  )
}

export function EditableCodeHighlight({ code, theme, onChange, language = 'json' }: any) {
  const editorRef = useRef(null)
  const [liveCode, setCode] = useState(code)
  // console.log('liveCode', liveCode, code)
  const onEditableChange = useCallback((liveCode: string) => {
    let setThisCode = liveCode.slice(0, -1)
    if (language === 'json') {
      try {
        setThisCode = JSON.stringify(JSON.parse(liveCode), null, 2)
        onChange({ code: setThisCode, valid: true })
      } catch (e) {
        onChange({ code: setThisCode, valid: false })
      }
    } else {
      onChange({ code: setThisCode, valid: true })
      // onChange(setThisCode)
    }
    setCode(setThisCode)
  }, [language, onChange])

  useEffect(() => {
    setCode(code)
  }, [code])

  useEditable(editorRef, onEditableChange, {
    disabled: false,
    indentation: 2
  })

  return (
    <div className="p-2">
      <Highlight
        {...defaultProps}
        theme={theme || defaultProps.theme}
        code={liveCode}
        language={language}
      >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={className + ' p-2'} style={style} ref={editorRef}>
            {tokens.map((line, i) => (
              <div {...getLineProps({ line, key: i })}>
                {line.map((token, key) => (
                  <>
                    <span {...getTokenProps({ token, key })} />
                  </>
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  )
}
