import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useFireproof } from "use-fireproof";

type Todo = Partial<{
  readonly text: string;
  readonly date: number;
  readonly completed: boolean;
}>;

describe("HOOK: useFireproof", () => {
  it("should be defined", () => {
    expect(useFireproof).toBeDefined();
  });

  it("renders the hook correctly and checks types", () => {
    renderHook(() => {
      const { database, useLiveQuery, useDocument } = useFireproof("dbname");
      expect(typeof useLiveQuery).toBe("function");
      expect(typeof useDocument).toBe("function");
      expect(database?.constructor.name).toBe("Database");
    });
  });
  it("undefined means generate _id", async () => {
    // let state = 0;
    const resUseFireproof = renderHook(() => useFireproof("dbnamex"));
    const { useDocument, useLiveQuery } = resUseFireproof.result.current;
    const resUseDocument = renderHook(() =>
      useDocument<Todo>(() => ({
        text: "",
        date: Date.now(),
        completed: false,
      })),
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [todo, setTodo, saveTodo] = resUseDocument.result.current;

    const texts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const text = ">" + Math.random().toString(36).substring(7);
      act(() => {
        setTodo({ text, date: Date.now(), completed: false });
      });
      texts.push(text);
      await act(() => saveTodo());
      //console.log("res", res);
    }

    const resUseLiveQuery = renderHook(() => useLiveQuery<Todo>("date", { limit: 100, descending: true }));
    await new Promise((res) => setTimeout(res, 500));
    resUseLiveQuery.rerender();
    await new Promise((res) => setTimeout(res, 500));
    resUseLiveQuery.rerender();
    await new Promise((res) => setTimeout(res, 500));
    console.log(new Date(), resUseLiveQuery.result.current);

    //     const todos = await act(() => useLiveQuery<Todo>("date", { limit: 10, descending: true }));
    //     let text = texts[texts.length - 1];
    //     console.log("todos", state, texts.length, todos.rows.length);
    //     switch (state) {
    //       case 3:
    //       case 0:
    //         console.log(">-1", state);
    //         texts.push(text);
    //         act(() => {
    //           setTodo({ text, date: Date.now(), completed: false });
    //         });
    //         // console.log(">-1.1", state);
    //         // expect(todo.text).toBe(text);
    //         // console.log(">-1.2", state);
    //         // expect(todo._id).toBeUndefined();
    //         // console.log(">-2", state);
    //         break;
    //       case 4:
    //       case 1:
    //         {
    //           console.log("4>", state);
    //           const res = await act(() => saveTodo());
    //           console.log("5>", state, res);
    //         }
    //         break;
    //       case 5:
    //       case 2:
    //         console.log("0>", state);
    //         expect(todo.text).toBe(text);
    //         console.log("1>", state);
    //         expect(todo._id).toBeDefined();

    //         // if (state >= 5) done();
    //         break;
    //       default:
    //         {
    //           console.log("<X>", state);
    //           console.log("2>", state, todos.docs);
    //           let docs: LiveQueryResult<
    //             Partial<{
    //               readonly text: string;
    //               readonly date: number;
    //               readonly completed: boolean;
    //             }>
    //           >;
    //           await act(() => {
    //             docs = todos.docs.map((i) => i.text).sort();
    //           });
    //           expect(docs).toEqual(texts.sort());
    //           console.log("3>", state);
    //           // done();
    //         }
    //         break;
    //     }
    //     console.log("post", state);
    //     state++;
    //   });
    //   result.rerender()
  });
});
