import { Browser } from './storage/browser.js'
import { Filesystem } from './storage/filesystem.js'
import { Rest } from './storage/rest.js'

const FORCE_IDB = typeof process !== 'undefined' && !!process.env?.FORCE_IDB

/* global window */

export const Loader = {
  appropriate: (name, keyId, config = {}) => {
    let isBrowser = false
    try {
      isBrowser = window.localStorage && true
    } catch (e) {}

    if (config.type === 'rest') {
      return new Rest(name, keyId, config)
    }

    if (FORCE_IDB || isBrowser) {
      return new Browser(name, keyId, config)
    } else {
      return new Filesystem(name, keyId, config)
    }
  }
}
