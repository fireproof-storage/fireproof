# useUploader React Hook

Allows you to connect to any service that accepts [CAR file uploads.](https://car.ipfs.io) Today [this means web3.storage.](https://web3.storage/docs/how-tos/work-with-car-files/)  Don't worry you don't have to do anything, this is the hardest part.

Once you are connected your data will be automatically replicated to web3.storage. Without encryption enabled (coming soon) this is public an irrevocable.

## Usage Example

In App.js:

```js
import { useFireproof } from '@fireproof/core/hooks/use-fireproof'
import { useUploader, UploaderCtx } from './hooks/useUploader'
import { KeyringProvider } from '@w3ui/react-keyring'

function App() {
  const fp = useFireproof('myAppName', defineIndexes, loadFixtures)
  const { fetchListWithTodos, fetchAllLists } = makeQueryFunctions(fp)
  
  // Use the useUploader hook within a KeyringProvider
  const up = useUploader(fp.database)
  
  return (
    <KeyringProvider>
      <UploaderCtx.Provider value={up}>
        <FireproofCtx.Provider value={fp}>
          <MyComponent />
        </FireproofCtx.Provider>
      </UploaderCtx.Provider>
    </KeyringProvider>
  )
}
```

In your components:

```js
import { FireproofCtx } from '@fireproof/core/hooks/use-fireproof'
import { UploaderCtx, UploadManager } from './hooks/useUploader'
import { useKeyring } from '@w3ui/react-keyring'

function MyComponent() {
  // Get Fireproof and Uploader contexts
  const { ready, database, addSubscriber } = useContext(FireproofCtx)
  const { uploaderReady } = useContext(UploaderCtx)

  // Get Keyring data
  const [{ agent, space }, { getProofs, loadAgent }] = useKeyring()
  const registered = Boolean(space?.registered())

  // Your component logic here
  // ...

  return (
    <>
      {/* Render the UploadManager component */}
      <UploadManager registered={registered} />
    </>
  )
}
```

This example demonstrates how to use the `useUploader` hook in conjunction with the `useFireproof` hook. The `useUploader` hook requires being inside a `KeyringProvider` to work properly.

See it in action in the [TodoMVC example app.](https://github.com/fireproof-storage/fireproof/tree/main/examples/todomvc)