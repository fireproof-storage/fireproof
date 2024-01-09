import { renderHook } from "@solidjs/testing-library";
import { expect, describe, it } from "vitest";
import { createDocument } from "../createDocument";

describe.only("HOOK: createDocument", () => {
  it("can perform all expected actions", async () => {
    const { result } = renderHook(() => createDocument(() => ({ text: "", completed: false })));
    const [doc, setDoc, saveDoc] = result;

    // 1. Can initialize a document
    expect(doc()).toEqual({ text: "", completed: false });

    // 2. Can update the document
    setDoc({ text: "hello", completed: true });
    expect(doc()).toEqual({ text: "hello", completed: true });

    // 3. Can reset the document
    setDoc();
    expect(doc()).toEqual({ text: "", completed: false });

    // 4. Can save the document to the database
    saveDoc();
    expect(await createDocument.database().get("1")).toEqual({ _id: "1", text: "", completed: false });
  });
});
