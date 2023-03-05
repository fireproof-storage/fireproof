import { useEffect, useState, createContext } from 'react'
import { useKeyring } from '@w3ui/react-keyring'
import { store } from '@web3-storage/capabilities/store'
import { Fireproof } from '@fireproof/core'
import { uploadCarBytes } from './useFireproof'
import { Authenticator, AuthenticationForm, AuthenticationSubmitted } from '../components/Authenticator'

export const UploaderCtx = createContext<{ registered: Boolean; uploaderReady: Boolean }>({
  registered: false,
  uploaderReady: false,
})

export function useUploader(database: Fireproof) {
  const [{ agent, space }, { getProofs, loadAgent }] = useKeyring()
  const registered = Boolean(space?.registered())
  const [uploaderReady, setUploaderReady] = useState(false)
  console.log('use uploader called', { registered, uploaderReady, agent, space })

  useEffect(() => {
    console.log('use uploader set remote block reader', registered)
    database.setRemoteBlockReader((cid: any) => {
      console.log('looking for', cid)
      throw 'not implemented'
    })

    if (registered) {
      const setUploader = async () => {
        if (uploaderReady) return
        await loadAgent()
        const withness = space.did()
        const delegz = { with: withness, ...store }
        delegz.can = 'store/*'
        const conf = {
          issuer: agent,
          with: withness,
          proofs: await getProofs([delegz]),
        }
        console.log('use uploader set remote block WRITER')

        database.setCarUploader((carCid: any, carBytes: Uint8Array) => {
          console.log('uploading', carCid)
          uploadCarBytes(conf, carCid, carBytes)
        })
        setUploaderReady(true)
      }
      setUploader()
    }
  }, [space])
  return { registered, uploaderReady }
}

export const UploadManager = ({ registered }: { registered: Boolean }) => {
  const child = registered ? (
    <p>Your changes are being saved to the public IPFS network with web3.storage</p>
  ) : (
    <SpaceRegistrar />
  )
  return (
    <div className="uploadManager">
      <Authenticator>{child}</Authenticator>
    </div>
  )
}

function SpaceRegistrar(): JSX.Element {
  const [, { registerSpace }] = useKeyring()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  function resetForm(): void {
    setEmail('')
  }
  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setSubmitted(true)
    try {
      await registerSpace(email)
    } catch (err) {
      console.log(err)
      throw new Error('failed to register', { cause: err })
    } finally {
      resetForm()
      setSubmitted(false)
    }
  }
  return (
    <div className="flex flex-col items-center space-y-24 pt-12">
      <div className="flex flex-col items-center space-y-2">
        <h3 className="text-lg">Verify your email address!</h3>
        <p>web3.storage is sending you a verification email. Please click the link.</p>
      </div>
      <div className="flex flex-col items-center space-y-4">
        <h5>Need a new verification email?</h5>
        <form
          className="flex flex-col items-center space-y-2"
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            void onSubmit(e)
          }}
        >
          <input
            className="text-black px-2 py-1 rounded"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
            }}
          />
          <input type="submit" className="w3ui-button" value="Re-send Verification Email" disabled={email === ''} />
        </form>
        {submitted && <p>Verification re-sent, please check your email for a verification email.</p>}
      </div>
    </div>
  )
}
