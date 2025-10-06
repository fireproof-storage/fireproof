import { encodeKey } from "@fireproof/core-base";

// @ts-expect-error "charwise" has no types
// cspell:ignore charwise
import charwise from "charwise";
import { describe, it, expect } from "vitest";

describe("charwise boolean handling", () => {
  it("should encode and decode boolean values correctly", () => {
    // Test true
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const trueEncoded = (charwise as any).encode(true) as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    expect((charwise as any).decode(trueEncoded)).toBe(true);

    // Test false
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const falseEncoded = (charwise as any).encode(false) as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    expect((charwise as any).decode(falseEncoded)).toBe(false);
  });

  it("should differentiate between boolean values", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const trueEncoded = (charwise as any).encode(true) as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const falseEncoded = (charwise as any).encode(false) as string;

    // Ensure encoded values are different
    expect(trueEncoded).not.toBe(falseEncoded);

    // Test ordering
    const orderedArray = [falseEncoded, trueEncoded].sort();

    // In most collation systems, false should come before true
    expect(orderedArray[0]).toBe(falseEncoded);
    expect(orderedArray[1]).toBe(trueEncoded);
  });

  it("should differentiate boolean false from other values", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const falseEncoded = (charwise as any).encode(false) as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const nullEncoded = (charwise as any).encode(null) as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const undefinedEncoded = (charwise as any).encode(undefined) as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const zeroEncoded = (charwise as any).encode(0) as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const emptyStringEncoded = (charwise as any).encode("") as string;

    // Ensure false is different from other "falsy" values
    expect(falseEncoded).not.toBe(nullEncoded);
    expect(falseEncoded).not.toBe(undefinedEncoded);
    expect(falseEncoded).not.toBe(zeroEncoded);
    expect(falseEncoded).not.toBe(emptyStringEncoded);
  });

  it("should handle comparison of encoded boolean values", () => {
    // Test with the charwise.encode directly
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const falseEncoded = (charwise as any).encode(false) as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const trueEncoded = (charwise as any).encode(true) as string;

    // Test with Fireproof's encodeKey function
    const falseFireproofEncoded = encodeKey(false);
    const trueFireproofEncoded = encodeKey(true);

    // Check if Fireproof's encoding matches charwise directly
    expect(falseFireproofEncoded).toBe(falseEncoded);
    expect(trueFireproofEncoded).toBe(trueEncoded);

    // Test exact matching
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const falseTest = (charwise as any).encode(false) as string;
    expect(falseTest).toBe(falseEncoded);

    // Test if equality comparison works after encoding/decoding
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    expect((charwise as any).decode(falseEncoded)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    expect((charwise as any).decode(falseEncoded) === false).toBe(true);
  });
});
