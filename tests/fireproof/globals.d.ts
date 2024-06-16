declare global {
  function describe(description: string, callback: () => void): void;
  function it(description: string, callback: () => void): void;
}
