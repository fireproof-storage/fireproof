import ReactDOM from "react-dom";
import React, { useEffect, useState } from "react";
import "./style.css";
// import { Fireproof } from '../../../packages/fireproof/src/fireproof.js'
// import { useFireproof } from '../../../packages/react/dist/index.mjs'
import { Fireproof } from "use-fireproof";
// import { useFireproof } from '../../../packages/react/dist/index.mjs'
// import { useFireproof } from 'use-fireproof'
// console.log(Fireproof, useFireproof)

const ledger = Fireproof.storage("tomato-park");

window.fireproof = ledger;

const App = () => {
  //   console.log('App')
  //   const { ledger, useLiveQuery, useDocument } = useFireproof()
  //   console.log('ledger', ledger)

  const [items, setItems] = useState([]);

  const [message, setMessage] = useState("");

  useEffect(() => {
    const onChange = async () => {
      const docs = await ledger.allDocuments();
      //   console.log('docs', docs)
      setItems(docs.rows);
    };
    onChange();
    return ledger.subscribe(onChange);
  }, [ledger]);

  //   const items = useLiveQuery('type', { key: 'todo' }).docs
  //   const [doc, setDoc, saveDoc] = useDocument({ message: 'new todo', type: 'todo' })
  //   console.log('items', items)
  return (
    <>
      <h1>Welcome to Tomato Park</h1>
      <form>
        <input value={message} onChange={(e) => setMessage(e.target.value)} />
        <button
          onClick={(e) => {
            e.preventDefault();
            ledger.put({ message, type: "todo" });
            setMessage("");
          }}
        >
          Save
        </button>
      </form>
      <ul>
        {items.map((item) => (
          <li key={item.key}>{item.value.message}</li>
        ))}
      </ul>
    </>
  );
};

ReactDOM.render(<App />, document.getElementById("root"));
