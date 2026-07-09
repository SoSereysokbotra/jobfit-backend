/**
 * Base class for value objects.
 *
 * A value object is an immutable type defined entirely by its attributes: it
 * has no identity, and two value objects are equal when their attributes are
 * equal (see {@link ValueObject.equals}). Properties are frozen on construction
 * to enforce immutability.
 *
 * @typeParam T - The shape of the value object's properties (its `props`).
 */
export abstract class ValueObject<T> {
  /** The value object's frozen (immutable) properties. */
  public readonly props: T;

  /**
   * @param props - The value object's properties. Frozen to prevent mutation.
   */
  constructor(props: T) {
    this.props = Object.freeze(props);
  }

  /**
   * Structural equality. Two value objects are equal when their properties are
   * deeply equal.
   *
   * @param vo - The value object to compare against.
   * @returns `true` when both value objects hold equal properties.
   */
  public equals(vo?: ValueObject<T>): boolean {
    if (vo === null || vo === undefined) {
      return false;
    }
    if (vo.props === undefined) {
      return false;
    }
    return JSON.stringify(this.props) === JSON.stringify(vo.props);
  }
}
