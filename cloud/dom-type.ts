interface document {
  getElementById: (id: string) => HTMLElement | null;
}

interface window {
    location: {
        hash: string;
        search: string;
        href: string;
    };
    postMessage: (message: string, targetOrigin: string) => void;
}

export const { document, window } = globalThis as unknown as { document: document, window: window };
