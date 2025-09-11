import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImgFile } from "../index.js"; // Adjust the import path as necessary
import { createElement } from "react";
import type { DocFileMeta } from "../index.js"; // Adjust the import path as necessary
import { AnyLink } from "@fireproof/core-types-blockstore";

// Extend HTMLElement to include querySelector for TypeScript

// Simple SVG content for testing
const SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="blue" />
</svg>`;

describe("COMPONENT: ImgFile", () => {
  // Mock URL methods
  const mockObjectURL = "mock-object-url";
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;

  beforeEach(() => {
    window.URL.createObjectURL = vi.fn(() => mockObjectURL);
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  // Test timeout value for CI
  const TEST_TIMEOUT = 60000; // 1 minute per test

  it(
    "renders the image from a File object",
    async () => {
      const file = new File([new Blob([SVG_CONTENT], { type: "image/svg+xml" })], "test.svg", { type: "image/svg+xml" });

      const { container } = render(
        createElement(ImgFile, {
          file: file,
          alt: "Test SVG",
          className: "test-class",
        }),
      );

      await waitFor(() => {
        const img = container.querySelector("img");
        expect(img).not.toBeNull();
      });

      const img = container.querySelector("img");
      expect(img?.getAttribute("src")).toBe(mockObjectURL);
      expect(img?.getAttribute("alt")).toBe("Test SVG");
      expect(img?.classList.contains("test-class")).toBe(true);
      expect(window.URL.createObjectURL).toHaveBeenCalledWith(file);
    },
    TEST_TIMEOUT,
  );

  it(
    "does not render when file is not present",
    () => {
      const { container } = render(
        createElement(ImgFile, {
          file: undefined,
          alt: "No File",
        }),
      );

      const img = container.querySelector("img");
      expect(img).toBeNull();
      expect(window.URL.createObjectURL).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT,
  );

  it(
    "supports legacy 'meta' parameter",
    async () => {
      const file = new File([new Blob([SVG_CONTENT], { type: "image/svg+xml" })], "legacy.svg", { type: "image/svg+xml" });

      const { container } = render(
        createElement(ImgFile, {
          meta: file,
          alt: "Legacy File",
        }),
      );

      await waitFor(() => {
        const img = container.querySelector("img");
        expect(img).not.toBeNull();
      });

      const img = container.querySelector("img");
      expect(img?.getAttribute("src")).toBe(mockObjectURL);
      expect(img?.getAttribute("alt")).toBe("Legacy File");
      expect(window.URL.createObjectURL).toHaveBeenCalledWith(file);
    },
    TEST_TIMEOUT,
  );

  it(
    "renders from DocFileMeta object",
    async () => {
      const file = new File([new Blob([SVG_CONTENT], { type: "image/svg+xml" })], "meta.svg", { type: "image/svg+xml" });

      // Create a mock DocFileMeta with required cid property
      const mockCid = { toString: () => "test-cid" } as AnyLink;
      const docFileMeta: DocFileMeta = {
        type: "image/svg+xml",
        size: file.size,
        cid: mockCid,
        file: async () => file,
      };

      const { container } = render(
        createElement(ImgFile, {
          file: docFileMeta,
          alt: "DocFileMeta Image",
        }),
      );

      await waitFor(() => {
        const img = container.querySelector("img");
        expect(img).not.toBeNull();
      });

      const img = container.querySelector("img");
      expect(img?.getAttribute("src")).toBe(mockObjectURL);
      expect(img?.getAttribute("alt")).toBe("DocFileMeta Image");
      expect(window.URL.createObjectURL).toHaveBeenCalledWith(file);
    },
    TEST_TIMEOUT,
  );

  it(
    "does not render for non-image file types",
    async () => {
      const textFile = new File(["test content"], "test.txt", { type: "text/plain" });

      const { container } = render(
        createElement(ImgFile, {
          file: textFile,
          alt: "Text File",
        }),
      );

      // Wait a bit to ensure any async operations complete
      await waitFor(
        () => {
          // Verify that createObjectURL was called (or not called)
          expect(window.URL.createObjectURL).toHaveBeenCalledTimes(0);
        },
        { timeout: 1000 },
      );

      const img = container.querySelector("img");
      expect(img).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    "cleans up object URLs when unmounted",
    async () => {
      const file = new File([new Blob([SVG_CONTENT], { type: "image/svg+xml" })], "cleanup.svg", { type: "image/svg+xml" });

      const { container, unmount } = render(
        createElement(ImgFile, {
          file: file,
          alt: "Cleanup Test",
        }),
      );

      await waitFor(() => {
        const img = container.querySelector("img");
        expect(img).not.toBeNull();
      });

      expect(window.URL.createObjectURL).toHaveBeenCalledWith(file);
      expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();

      // Unmount to trigger cleanup
      unmount();

      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith(mockObjectURL);
    },
    TEST_TIMEOUT,
  );

  it(
    "does not cleanup blob URL when DocFileMeta returns new objects for same content",
    async () => {
      // Create a file with specific content
      const fileContent = new Blob([SVG_CONTENT], { type: "image/svg+xml" });
      const baseFile = new File([fileContent], "same-content.svg", {
        type: "image/svg+xml",
        lastModified: 1234567890000, // Fixed timestamp for consistent cache key
      });

      // Create a DocFileMeta that returns new File objects with same content
      const mockCid = { toString: () => "same-content-cid" } as AnyLink;
      const docFileMeta: DocFileMeta = {
        type: "image/svg+xml",
        size: baseFile.size,
        cid: mockCid,
        file: async () => {
          // Always return a new File object but with same content and metadata
          return new File([fileContent], "same-content.svg", {
            type: "image/svg+xml",
            lastModified: 1234567890000, // Same timestamp for consistent cache key
          });
        },
      };

      const { container, rerender } = render(
        createElement(ImgFile, {
          file: docFileMeta,
          alt: "Content-Based Test",
        }),
      );

      // Wait for initial render
      await waitFor(() => {
        const img = container.querySelector("img");
        expect(img).not.toBeNull();
      });

      expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();

      // Force a re-render with a NEW DocFileMeta object that yields the same content
      const fileSpy = vi.fn(async () =>
        new File([fileContent], "same-content.svg", {
          type: "image/svg+xml",
          lastModified: 1234567890000,
        }),
      );
      const docFileMeta2: DocFileMeta = {
        ...docFileMeta,
        file: fileSpy,
      };
      rerender(
        createElement(ImgFile, {
          file: docFileMeta2,
          alt: "Content-Based Test Updated",
        }),
      );

      // Wait for any async operations to complete
      await waitFor(
        () => {
          const img = container.querySelector("img");
          expect(img).not.toBeNull();
        },
        { timeout: 2000 },
      );

      // The blob URL should NOT be cleaned up because the content is the same
      expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();
      // Should not create a new object URL for same content
      expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
      // And the resolver was invoked again
      expect(fileSpy).toHaveBeenCalledTimes(1);
    },
    TEST_TIMEOUT,
  );
});
