// from https://github.com/sw-yx/hooks/blob/master/src/index.tsx

import * as React from 'react'

let storageSupported = false
try {
  storageSupported = window.localStorage && true
} catch (e) {}

export type Props = { text: string }

const STRINGARRAYSERIALIZER = '#*#*#*#*#*STRINGARRAYSERIALIZER#*#*#*#*#*'
const noOptions = {
  stateObserver: noop,
  localStorageName: undefined,
  controlled: false,
}
/**
 * **useInput hook:**
 *
 * a hook to be spread right into an input element.
 * eg `<input {...useInput('')}>`
 *
 * if you pass controlled = true,
 *
 * - it exposes a `resetValue` to reset the value to initialvalue
 * - it also exposes a `setValue`  where you can manually set value... just in case
 *
 * instead of passing defaultValue to your input, pass it to useInput!
 * pass array of strings too :)
 * if you are making a checkbox, use `useCheckInput` instead
 *
 * */
export function useInput(
  /** prop: set initial value */
  initialValue: number | string | string[],
  options?: {
    /** prop: pass a callback if you want to know about changes */
    stateObserver?: (arg: typeof initialValue) => void
    /** if you want to persist to localstorage, pass a name for it! */
    localStorageName?: String
    /** pass true if you want a resetValue or setValue */
    controlled?: boolean
  }
) {
  const { stateObserver, localStorageName, controlled } = options || noOptions
  let _initialValue = initialValue

  // safely check localstorage and coerce the right types
  if (storageSupported && typeof localStorageName === 'string') {
    let v = localStorage.getItem(localStorageName)
    if (v) {
      if (typeof initialValue === 'number') _initialValue = Number(v)
      else if (Array.isArray(v)) _initialValue = v.split(STRINGARRAYSERIALIZER)
      else _initialValue = v // string
      if (stateObserver) stateObserver(_initialValue)
    }
  }

  let [value, setValue] = React.useState<typeof _initialValue>(_initialValue)
  const onChange = (e: { target: { type: string; value: string } }) => {
    if (e.target.type === 'checkbox') {
      throw new Error(
        'useInput error - type=checkbox specified, this is likely a mistake by the developer. you may want useCheckInput instead'
      )
    }
    let val = typeof initialValue === 'number' ? Number(e.target.value) : e.target.value
    setValue(val)
    if (storageSupported && typeof localStorageName === 'string') {
      if (val !== initialValue) {
        localStorage.setItem(localStorageName, String(Array.isArray(val) ? val.join(STRINGARRAYSERIALIZER) : val))
      } else {
        localStorage.removeItem(localStorageName)
      }
    }
    if (stateObserver) stateObserver(val)
  }
  const resetValue = () => setValue(initialValue)
  if (controlled) {
    return { onChange, value, setValue, resetValue }
  } else {
    return { onChange, value }
  }
}

// utils

function noop() {}
