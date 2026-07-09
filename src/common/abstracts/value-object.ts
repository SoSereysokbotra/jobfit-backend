// src/common/abstracts/value-object.ts
//
// Base class for Value Objects (see PATTERNS.md § Value Object Pattern).
// Value objects are immutable and compared by structural equality — two VOs are equal
// when they are the same type and carry the same data. Subclasses assign their readonly
// fields in the constructor (validating first, throwing on invalid input) and may
// override equals()/toJSON() for custom semantics.

export abstract class ValueObject {
  /**
   * Structural equality. Equal when `other` is the same concrete type and its own
   * enumerable properties serialize identically. Subclasses may override.
   */
  equals(other?: ValueObject): boolean {
    if (other === null || other === undefined) return false;
    if (other.constructor !== this.constructor) return false;
    return JSON.stringify(this) === JSON.stringify(other);
  }
}
