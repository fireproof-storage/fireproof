import { exception2Result, Result } from "@adviser/cement";
import { CompactStrategy } from "@fireproof/core-types-base";

const compactStrategyRegistry = new Map<string, CompactStrategy>();

export function registerCompactStrategy(compactStrategy: CompactStrategy): () => void {
  const key = compactStrategy.name.toLowerCase();
  if (compactStrategyRegistry.has(key)) {
    throw new Error(`compactStrategy ${compactStrategy.name} already registered`);
  }
  compactStrategyRegistry.set(key, compactStrategy);
  return () => {
    compactStrategyRegistry.delete(key);
  };
}

export function getCompactStrategy(name = "fireproof"): Result<CompactStrategy> {
  return exception2Result(() => getCompactStrategyThrow(name));
}

export function getCompactStrategyThrow(name = "fireproof"): CompactStrategy {
  const key = name.toLowerCase();
  if (!compactStrategyRegistry.has(key)) {
    throw new Error(`compactStrategy ${name} not found`);
  }
  return compactStrategyRegistry.get(key)!;
}
