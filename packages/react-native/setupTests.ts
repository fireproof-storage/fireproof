import randomBytes from 'randombytes';
import { TextEncoder } from 'util';

global.TextEncoder = TextEncoder;

const crypto = {
  getRandomValues: (arr: unknown[]) => randomBytes(arr.length),
  subtle: {
    encrypt: () => Promise.resolve(new ArrayBuffer(10)),
    digest: () => Promise.resolve(''),
    importKey: () => Promise.resolve(''),
    sign: () => Promise.resolve(''),
  },
};

Object.defineProperty(window, 'crypto', {
  value: crypto,
  writable: true,
});

Object.defineProperty(global, 'crypto', {
  value: crypto,
  writable: true,
});
