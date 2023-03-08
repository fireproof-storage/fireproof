const shortLink = (l: string) => `${String(l).slice(0, 4)}..${String(l).slice(-4)}`
const clockLog = new Set<string>()

export const TimeTravel = ({ database }) => {
  database.clock && database.clock.length && clockLog.add(database.clock.toString())
  const diplayClocklog = Array.from(clockLog).reverse()
  return (
    <div className="timeTravel">
      <h2>Time Travel</h2>
      {/* <p>Copy and paste a <b>Fireproof clock value</b> to your friend to share application state, seperate them with commas to merge state.</p> */}
      {/* <InputArea
            onSubmit={
              async (tex: string) => {
                await database.setClock(tex.split(','))
              }
            }
            placeholder='Copy a CID from below to rollback in time.'
            autoFocus={false}
          /> */}
      <p>
        Click a <b>Fireproof clock value</b> below to rollback in time.
      </p>
      <p>Clock log (newest first): </p>
      <ul>
        {diplayClocklog.map((entry) => (
          <li key={entry}>
            <button
              onClick={async () => {
                await database.setClock([entry])
              }}
            >
              {shortLink(entry)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
