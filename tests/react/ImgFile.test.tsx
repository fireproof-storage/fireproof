import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireproof } from "@fireproof/core";
import { ImgFile } from "use-fireproof";
import type { Database } from "@fireproof/core";
import { createElement } from "react";

// Extend HTMLElement to include querySelector for TypeScript
declare global {
  interface HTMLElement {
    querySelector(selectors: string): HTMLElement | null;
  }
}

// Augment Vitest's Assertion interface
declare module "vitest" {
  interface Assertion {
    toHaveAttribute(attr: string, value?: string): Assertion;
    toHaveClass(className: string): Assertion;
  }
}

const SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="blue" />
</svg>`;

const mockObjectURL = "mock-object-url";
window.URL.createObjectURL = vi.fn(() => mockObjectURL);
window.URL.revokeObjectURL = vi.fn();

describe("COMPONENT: ImgFile", () => {
  let db: Database;
  let docId: string;

  beforeEach(async () => {
    db = fireproof("img-file-test-db");

    const svgBlob = new Blob([SVG_CONTENT], { type: "image/svg+xml" });
    const file = new File([svgBlob], "test.svg", { type: "image/svg+xml" });

    const result = await db.put({
      description: "Test SVG",
      _files: {
        myFile: file,
      },
    });

    docId = result.id;
  });

  it("renders the image from a File object", async () => {
    const file = new File([new Blob([SVG_CONTENT], { type: "image/svg+xml" })], "file.svg", { type: "image/svg+xml" });

    const { container } = render(
      createElement(
        "div",
        null,
        createElement(ImgFile, {
          file,
          alt: "File",
          className: "test",
        }),
      ),
    );

    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
    });

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", mockObjectURL);
    expect(img).toHaveAttribute("alt", "File");
    expect(img).toHaveClass("test");

    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });

  it("renders the image from a document file", async () => {
    const doc = await db.get(docId);
    expect(doc._files).toBeTruthy();
    expect(doc._files?.myFile).toBeTruthy();
    if (!doc._files?.myFile) throw new Error("Document does not have a file");

    const { container } = render(
      createElement(ImgFile, {
        file: doc._files.myFile,
        alt: "Test SVG",
        className: "test",
      }),
    );

    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
    });

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", mockObjectURL);
    expect(img).toHaveAttribute("alt", "Test SVG");
    expect(img).toHaveClass("test");

    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });

  it("renders correctly when used with document files", async () => {
    const doc = await db.get(docId);

    const { container } = render(
      createElement(
        "div",
        null,
        doc._files &&
          doc._files.myFile &&
          createElement(ImgFile, {
            file: doc._files.myFile,
            alt: "File",
            className: "test",
          }),
      ),
    );

    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
    });

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", mockObjectURL);
    expect(img).toHaveAttribute("alt", "File");
    expect(img).toHaveClass("test");
  });

  it("does not render when file is not present", () => {
    const { container } = render(
      createElement(
        "div",
        null,
        createElement(ImgFile, {
          file: null as unknown as File,
          alt: "File",
          className: "test",
        }),
      ),
    );

    const img = container.querySelector("img");
    expect(img).toBeNull();
  });

  // Legacy support tests
  it("renders the image using legacy 'meta' parameter with a File object", async () => {
    const file = new File([new Blob([SVG_CONTENT], { type: "image/svg+xml" })], "file.svg", { type: "image/svg+xml" });

    const { container } = render(
      createElement(
        "div",
        null,
        createElement(ImgFile, {
          meta: file,
          alt: "Legacy File",
          className: "legacy-test",
        }),
      ),
    );

    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
    });

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", mockObjectURL);
    expect(img).toHaveAttribute("alt", "Legacy File");
    expect(img).toHaveClass("legacy-test");

    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });

  it("renders the image using legacy 'meta' parameter with a document file", async () => {
    const doc = await db.get(docId);
    expect(doc._files).toBeTruthy();
    expect(doc._files?.myFile).toBeTruthy();
    if (!doc._files?.myFile) throw new Error("Document does not have a file");

    const { container } = render(
      createElement(ImgFile, {
        meta: doc._files.myFile,
        alt: "Legacy Test SVG",
        className: "legacy-test",
      }),
    );

    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
    });

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", mockObjectURL);
    expect(img).toHaveAttribute("alt", "Legacy Test SVG");
    expect(img).toHaveClass("legacy-test");

    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });

  it("prioritizes 'file' parameter over 'meta' when both are provided", async () => {
    // Create two different files with different names to distinguish them
    const file1 = new File([new Blob([SVG_CONTENT], { type: "image/svg+xml" })], "file1.svg", { type: "image/svg+xml" });
    const file2 = new File([new Blob([SVG_CONTENT], { type: "image/svg+xml" })], "file2.svg", { type: "image/svg+xml" });

    // Mock createObjectURL to return different URLs for different files
    window.URL.createObjectURL = vi.fn((file) => {
      if (file === file1) return "file1-url";
      if (file === file2) return "file2-url";
      return "unknown-url";
    });

    const { container } = render(
      createElement(ImgFile, {
        file: file1,
        meta: file2,
        alt: "Priority Test",
      }),
    );

    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
    });

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "file1-url");

    // Reset the mock for other tests
    window.URL.createObjectURL = vi.fn(() => mockObjectURL);
  });
});
