import './App.css'
import { window } from '../../dom-type.js'
import { BuildURI, URI } from '@adviser/cement'
import { ensureSuperThis } from 'use-fireproof'

const sthis = ensureSuperThis()
function App() {
  const uri = URI.from(window.location.href)
  // const [count, setCount] = useState(parseInt(uri.getParam('count', '0')))
  const token = sthis.nextId().str
  return (
    <>
      {/* <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1> */}
      <div className="card">
        <button onClick={() => { 
          window.location.href = BuildURI.from(uri.getParam('backUrl')).setParam('token', token).toString()
        }
        }>
          <p>
          BackUrl: {uri.getParam('backUrl')}
          </p>

          <p>
          Token: {token}
          </p>

        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
