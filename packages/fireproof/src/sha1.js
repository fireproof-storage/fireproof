// from https://github.com/duzun/sync-sha1/blob/master/rawSha1.js
// MIT License Copyright (c) 2020 Dumitru Uzun
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// import {
//   isLittleEndian, switchEndianness32
// } from 'string-encode'

/**
* SHA1 on binary array
*
* @param   {Uint8Array}  b  Data to hash
*
* @return  {Uint8Array}  sha1 hash
*/
export default function rawSha1 (b) {
  let i = b.byteLength
  let bs = 0
  let A; let B; let C; let D; let G
  const H = Uint32Array.from([A = 0x67452301, B = 0xEFCDAB89, ~A, ~B, 0xC3D2E1F0])
  const W = new Uint32Array(80)
  const nrWords = (i / 4 + 2) | 15
  const words = new Uint32Array(nrWords + 1)
  let j

  words[nrWords] = i * 8
  words[i >> 2] |= 0x80 << (~i << 3)
  for (;i--;) {
    words[i >> 2] |= b[i] << (~i << 3)
  }

  for (A = H.slice(); bs < nrWords; bs += 16, A.set(H)) {
    for (i = 0; i < 80;
      A[0] = (
        G = ((b = A[0]) << 5 | b >>> 27) +
                  A[4] +
                  (W[i] = (i < 16) ? words[bs + i] : G << 1 | G >>> 31) +
                  0x5A827999,
        B = A[1],
        C = A[2],
        D = A[3],
        G + ((j = i / 5 >> 2) // eslint-disable-line no-cond-assign
          ? j !== 2
            ? (B ^ C ^ D) + (j & 2 ? 0x6FE0483D : 0x14577208)
            : (B & C | B & D | C & D) + 0x34994343
          : B & C | ~B & D
        )
      )
      , A[1] = b
      , A[2] = B << 30 | B >>> 2
      , A[3] = C
      , A[4] = D
      , ++i
    ) {
      G = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16]
    }

    for (i = 5; i;) H[--i] = H[i] + A[i]
  }

  // if (isLittleEndian()) {
  //   H = H.map(switchEndianness32)
  // }

  return new Uint8Array(H.buffer, H.byteOffset, H.byteLength)
}
