import { describe, it, expect } from "vitest";
// @ts-expect-error "charwise" has no types
import charwise from "charwise";
import { encodeKey } from "../../src/indexer-helpers";

describe("charwise boolean handling", () => {
  it("should encode and decode boolean values correctly", () => {
    // Test true
    const trueEncoded = charwise.encode(true);
    expect(charwise.decode(trueEncoded)).toBe(true);
    
    // Test false
    const falseEncoded = charwise.encode(false);
    expect(charwise.decode(falseEncoded)).toBe(false);
    
    // Log encoded values for inspection
    console.log("true encoded:", trueEncoded);
    console.log("false encoded:", falseEncoded);
  });

  it("should differentiate between boolean values", () => {
    const trueEncoded = charwise.encode(true);
    const falseEncoded = charwise.encode(false);
    
    // Ensure encoded values are different
    expect(trueEncoded).not.toBe(falseEncoded);
    
    // Test ordering
    const orderedArray = [falseEncoded, trueEncoded].sort();
    console.log("Sorted encoded values:", orderedArray);
    
    // In most collation systems, false should come before true
    expect(orderedArray[0]).toBe(falseEncoded);
    expect(orderedArray[1]).toBe(trueEncoded);
  });

  it("should differentiate boolean false from other values", () => {
    const falseEncoded = charwise.encode(false);
    const nullEncoded = charwise.encode(null);
    const undefinedEncoded = charwise.encode(undefined);
    const zeroEncoded = charwise.encode(0);
    const emptyStringEncoded = charwise.encode("");
    
    console.log("false encoded:", falseEncoded);
    console.log("null encoded:", nullEncoded);
    console.log("undefined encoded:", undefinedEncoded);
    console.log("0 encoded:", zeroEncoded);
    console.log("empty string encoded:", emptyStringEncoded);
    
    // Ensure false is different from other "falsy" values
    expect(falseEncoded).not.toBe(nullEncoded);
    expect(falseEncoded).not.toBe(undefinedEncoded);
    expect(falseEncoded).not.toBe(zeroEncoded);
    expect(falseEncoded).not.toBe(emptyStringEncoded);
  });

  it("should handle comparison of encoded boolean values", () => {
    // Test with the charwise.encode directly
    const falseEncoded = charwise.encode(false);
    const trueEncoded = charwise.encode(true);
    
    // Test with Fireproof's encodeKey function
    const falseFireproofEncoded = encodeKey(false);
    const trueFireproofEncoded = encodeKey(true);
    
    console.log("Fireproof false encoded:", falseFireproofEncoded);
    console.log("Fireproof true encoded:", trueFireproofEncoded);
    
    // Check if Fireproof's encoding matches charwise directly
    expect(falseFireproofEncoded).toBe(falseEncoded);
    expect(trueFireproofEncoded).toBe(trueEncoded);
    
    // Test exact matching
    const falseTest = charwise.encode(false);
    expect(falseTest).toBe(falseEncoded);
    
    // Test if equality comparison works after encoding/decoding
    expect(charwise.decode(falseEncoded)).toBe(false);
    expect(charwise.decode(falseEncoded) === false).toBe(true);
  });
});
