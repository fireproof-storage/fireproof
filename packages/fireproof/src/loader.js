import { Browser } from './storage/browser.js'
import { Filesystem } from './storage/filesystem.js'
import { Rest } from './storage/rest.js'

const FORCE_IDB = typeof process !== 'undefined' && !!process.env?.FORCE_IDB

/* global window */

export const Loader = {
  appropriate: (name, config = {}, header = {}) => {
    let isBrowser = false
    try {
      isBrowser = window.localStorage && true
    } catch (e) {}

    if (config.type === 'rest') {
      return new Rest(name, config, header)
    }

    if (FORCE_IDB || isBrowser) {
      return new Browser(name, config, header)
    } else {
      return new Filesystem(name, config, header)
    }
  }
}
