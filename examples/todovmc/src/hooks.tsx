// from https://github.com/sw-yx/hooks/blob/master/src/index.tsx

import * as React from "react"
import produce from "immer"

export type Props = { text: string }

export function useProduceState<S>(
    initState: S,
    observer: (newState: S) => void = noop
): [S, React.Dispatch<React.SetStateAction<S>>] {
    const [state, setState] = React.useState(initState)
    const cb = (mutatorOrValue: S | (() => S), next?: Function) => {
        if (isFunction(mutatorOrValue)) {
            // is a function, put it through immer
            const mutator = mutatorOrValue as any // failed to get this working: const mutator = mutatorOrValue; // as ((draft: Draft<S>) => S);
            setState((s: S) => produce<S>(s, d => void mutator(d)))
            observer(state)
        } else {
            // is a value
            const value = mutatorOrValue as S
            setState(mutatorOrValue)
            observer(value)
        }
        if (next) next() // post setState callback
    }
    // return [state, useCallback(cb, [setState])];
    return [state, cb] as [any, (mutatorOrValue: any, next?: Function) => {}];
    // return [state, cb]
}

// https://stackoverflow.com/questions/5999998/how-can-i-check-if-a-javascript-variable-is-function-type
function isFunction<T>(functionToCheck: Function | T) {
    return functionToCheck && {}.toString.call(functionToCheck) === "[object Function]"
}

const STRINGARRAYSERIALIZER = "#*#*#*#*#*STRINGARRAYSERIALIZER#*#*#*#*#*"
const noOptions = {
    stateObserver: noop,
    localStorageName: undefined,
    controlled: false
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
    if (typeof window !== "undefined" && window.localStorage && typeof localStorageName === "string") {
        let v = localStorage.getItem(localStorageName)
        if (v) {
            if (typeof initialValue === "number") _initialValue = Number(v)
            else if (Array.isArray(v)) _initialValue = v.split(STRINGARRAYSERIALIZER)
            else _initialValue = v // string
            if (stateObserver) stateObserver(_initialValue)
        }
    }

    let [value, setValue] = React.useState<typeof _initialValue>(_initialValue)
    const onChange = (e: { target: { type: string; value: string } }) => {
        if (e.target.type === "checkbox") {
            throw new Error(
                "useInput error - type=checkbox specified, this is likely a mistake by the developer. you may want useCheckInput instead"
            )
        }
        let val = typeof initialValue === "number" ? Number(e.target.value) : e.target.value
        setValue(val)
        if (typeof window !== "undefined" && window.localStorage && typeof localStorageName === "string") {
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

/**
 * **useCheckInput hook:**
 *
 * a hook to be spread right into an input type="checkbox" element.
 * eg `<input type="checkbox" {...useCheckInput(false)}>`
 *
 * also exposes a `resetValue` to reset the value to initialvalue
 * also exposes a `setValue`  where you can manually set value... just in case
 * instead of passing defaultValue to your input, pass it to useCheckInput!
 *
 * */
export function useCheckInput(
    /** prop: set initial value */
    initialValue: boolean,
    options?: {
        /** prop: pass a callback if you want to know about changes */
        stateObserver?: (arg: boolean) => void
        /** if you want to persist to localstorage, pass a name for it! */
        localStorageName?: String
        /** pass true if you want a resetValue or setValue */
        controlled?: boolean
    }
) {
    const { stateObserver, localStorageName, controlled } = options || noOptions
    let _initialValue = initialValue
    // safely check localstorage and coerce the right types
    if (typeof window !== "undefined" && window.localStorage && typeof localStorageName === "string") {
        let v = localStorage.getItem(localStorageName)
        if (v) {
            _initialValue = v === "true" // dont cast strings with Boolean lol
            if (stateObserver) stateObserver(_initialValue)
        }
    }

    let [value, setValue] = React.useState<typeof _initialValue>(_initialValue)
    const onChange = (e: { target: { type: string; checked: boolean } }) => {
        if (e.target.type !== "checkbox") {
            throw new Error("useCheckInput error - no checkbox specified, this is likely a mistake by the developer")
        }
        const val = e.target.checked
        setValue(val)
        if (typeof window !== "undefined" && window.localStorage && typeof localStorageName === "string") {
            if (val !== initialValue) {
                localStorage.setItem(localStorageName, String(val))
            } else {
                localStorage.removeItem(localStorageName)
            }
        }
        if (stateObserver) stateObserver(val)
    }
    const resetValue = () => setValue(initialValue)
    if (controlled) {
        return { onChange, checked: value, setValue, resetValue }
    } else {
        return { onChange, checked: value }
    }
}

export function useLoading() {
    const [isLoading, setState] = React.useState(false)
    const mount = React.useRef(false)
    React.useEffect(() => {
        mount.current = true
        return () => void (mount.current = false)
    }, [])
    const load = (aPromise: Promise<any>) => {
        setState(true)
        return aPromise.finally(() => {
            if (mount.current) setState(false)
        })
    }
    return [isLoading, load] as const
}

export function useKeydown(key: string, handler: Function) {
    React.useEffect(() => {
        const cb = (e: KeyboardEvent) => e.key === key && handler(e)
        document.body.addEventListener("keydown", cb)
        return () => {
            document.body.removeEventListener("keydown", cb)
        }
    }, [key, handler])
}

export function useLocalStorage(key: string, optionalCallback: any = noop) {
    const [state, setState] = React.useState<any | null>(null)
    React.useEffect(() => {
        // chose to make this async
        const existingValue = localStorage.getItem(key)
        if (existingValue) {
            const parsedValue = JSON.parse(existingValue)
            setState(parsedValue)
            optionalCallback(parsedValue)
        }
    }, [])
    const removeItem = () => {
        setState(null)
        localStorage.removeItem(key)
        optionalCallback(null)
    }
    const setItem = (obj: any) => {
        setState(obj)
        localStorage.setItem(key, JSON.stringify(obj))
        optionalCallback(obj)
    }
    return [state, setItem, removeItem] as [(any | null), (obj: any) => void, () => void]
}

// utils

function noop() { }

// export function useOptimisticState(initState) {
//   const [state, setState] = useState(initState);
//   const oldState = useRef(state);
//   function optimisticSetState(nextState) {
//     oldState.current = state;
//     setState(nextState);
//   }
//   async function tryAPI(somePromise) {
//     return async function(yay, nay) {
//       try {
//         yay(optimisticSetState);
//         return await somePromise;
//       } catch (err) {
//         nay(err);
//         setState(oldState.current);
//         return err;
//       }
//     };
//   }
//   return [state, tryAPI];
// }

// // usage
// const [state, tryAPI] = useOptimisticState({ count: 0})
// const success = setState => setState({ count : state.count + 1 })
// const failure = error => console.log('Error: ', error)
// const onClick = () => tryAPI(api.plusOne())(success, failure)

// export default function App() {
//   const [state, setState] = useProduceState({ foo: 1, bar: 2 });
//   return (
//     <div>
//       <h1>setoldstate</h1>
//       <div>{JSON.stringify(state)}</div>
//       <button onClick={() => setState(draft => void (draft.foo = 3))}>
//         test
//       </button>
//     </div>
//   );
// }