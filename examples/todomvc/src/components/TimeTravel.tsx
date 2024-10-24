const shortLink = (l: string) => `${String(l).slice(0, 4)}..${String(l).slice(-4)}`;
const clockLog = new Set<string>();

export const TimeTravel = ({ ledger }) => {
  ledger.clock && ledger.clock.length && clockLog.add(ledger.clock.toString());
  const diplayClocklog = Array.from(clockLog).reverse();
  return (
    <div className="timeTravel">
      <h2>Time Travel</h2>
      {/* <p>Copy and paste a <b>Fireproof clock value</b> to your friend to share application state, seperate them with commas to merge state.</p> */}
      {/* <InputArea
            onSubmit={
              async (tex: string) => {
                await ledger.setClock(tex.split(','))
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
                // await Fireproof.zoom(ledger, [entry])
                console.log("todo zoom", entry);
              }}
            >
              {shortLink(entry)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
