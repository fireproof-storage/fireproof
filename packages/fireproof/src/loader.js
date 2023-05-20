import { Browser } from './storage/browser.js'
import { Filesystem } from './storage/filesystem.js'

const FORCE_IDB = typeof process !== 'undefined' && !!process.env?.FORCE_IDB

/* global window */

export const Loader = {
  appropriate: (name, keyId, config = {}) => {
    let isBrowser = false
    try {
      isBrowser = window.localStorage && true
    } catch (e) {}

    if (FORCE_IDB || isBrowser) {
      return new Browser(name, keyId, config)
    } else {
      return new Filesystem(name, keyId, config)
    }
  }
}
