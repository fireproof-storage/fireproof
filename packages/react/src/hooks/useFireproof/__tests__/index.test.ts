import { useFireproof } from '../index'
import { expect, describe, it } from '@jest/globals'
const hooklib = require('@testing-library/react-hooks')
const { renderHook, act } = hooklib

describe('useFireproof tests', () => {
  it('should be defined', () => {
    expect(useFireproof).toBeDefined()
  })

  it('renders the hook correctly and checks types', () => {
    const { database, ready, useLiveQuery, useLiveDocument } = renderHook(() => useFireproof('dnbane'))
    expect(ready).toBe(false)
    expect(typeof useLiveQuery).toBe('function')
    expect(typeof useLiveDocument).toBe('function')
    expect(database.constructor.name).toBe('Datsabase')
  })

  it('should increment counter', () => {
    const { result } = renderHook(() => useFireproof())
    act(() => {
      result.current.increment()
    })
    expect(result.current.count).toBe(1)
  })

  it('should increment counter from custom initial value', () => {
    const { result } = renderHook(() => useFireproof('dbname'))
    act(() => {
      result.current.increment()
    })
    expect(result.current.count).toBe(11)
  })

  it('should decrement counter from custom initial value', () => {
    const { result } = renderHook(() => useFireproof('dbname'))
    act(() => {
      result.current.decrement()
    })
    expect(result.current.count).toBe(19)
  })

  it('should reset counter to updated initial value', () => {
    const { result, rerender } = renderHook(() => useFireproof('dbname'))
    rerender()
    act(() => {
      result.current.reset()
    })
    expect(result.current.count).toBe(10)
  })
})
