
/* global localStorage */
let storageSupported = false
try {
  storageSupported = window.localStorage && true
} catch (e) {}
export function localGet (key) {
  if (storageSupported) {
    return localStorage && localStorage.getItem(key)
  }
}
export function localSet (key, value) {
  if (storageSupported) {
    return localStorage && localStorage.setItem(key, value)
  }
}
