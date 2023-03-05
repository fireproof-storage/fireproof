import { useEffect } from 'react'
import { useKeyring } from '@w3ui/react-keyring'
import { store } from '@web3-storage/capabilities/store'
import { Fireproof } from '@fireproof/core'
import { uploadCarBytes } from './useFireproof'

export function useUploader(database: Fireproof) {
  const [{ agent, space }, { getProofs, loadAgent }] = useKeyring()
  const registered = Boolean(space?.registered())

  useEffect(() => {
    console.log('registered', registered)
    if (registered) {
      const setUploader = async () => {
        await loadAgent()
        const withness = space.did()
        const delegz = { with: withness, ...store }
        delegz.can = 'store/*'
        const conf = {
          issuer: agent,
          with: withness,
          proofs: await getProofs([delegz]),
        }
        database.setCarUploader((carCid: any, carBytes: Uint8Array) => {
          uploadCarBytes(conf, carCid, carBytes)
        })
      }
      setUploader()
    }
  }, [registered])
  return registered
}
