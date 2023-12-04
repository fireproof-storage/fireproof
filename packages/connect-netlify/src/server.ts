import { getStore } from '@netlify/blobs'

export default async (req: Request) => {
  const url = new URL(req.url)
  const carId = url.searchParams.get('car')
  if (carId) {
    const carFiles = getStore('cars')
    if (req.method === 'PUT') {
      const carArrayBuffer = new Uint8Array(await req.arrayBuffer())
      await carFiles.set(carId, carArrayBuffer)
      return new Response(JSON.stringify({ok: true}), { status: 201 })
    } else if (req.method === 'GET') {
      const carArrayBuffer = await carFiles.get(carId)
      return new Response(carArrayBuffer, { status: 200 })
    }
  } else {
    return new Response(JSON.stringify({ error: 'Invalid path' }), { status: 400 })
  }
}

export const config = { path: '/fireproof' }
