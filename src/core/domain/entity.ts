/**
 * Base class for all domain entities.
 *
 * An entity has a stable identity (`id`) that distinguishes it from all other
 * entities, independent of its attribute values. Two entities are considered
 * equal when they share the same identity — see {@link Entity.equals}.
 *
 * Every entity also carries audit timestamps (`createdAt` / `updatedAt`).
 * Subclasses that mutate state should call the protected {@link Entity.touch}
 * method to advance `updatedAt`.
 *
 * @typeParam T - The shape of the entity's properties (its `props`).
 */
export abstract class Entity<T> {
  protected readonly _id: string;
  private _updatedAt: Date;
  private readonly _createdAt: Date;

  /** The entity's mutable/immutable property bag. */
  public readonly props: T;

  /**
   * @param props - The entity's properties.
   * @param id - Optional identity. A UUID is generated when omitted (new entity).
   * @param timestamps - Optional audit timestamps, supplied when rehydrating a
   *   persisted entity. Both default to the current time for a brand-new entity.
   */
  constructor(
    props: T,
    id?: string,
    timestamps?: { createdAt?: Date; updatedAt?: Date },
  ) {
    this._id = id ?? crypto.randomUUID();
    this.props = props;
    this._createdAt = timestamps?.createdAt ?? new Date();
    this._updatedAt = timestamps?.updatedAt ?? this._createdAt;
  }

  /** The entity's unique identity. */
  get id(): string {
    return this._id;
  }

  /** Timestamp of when the entity was first created. */
  get createdAt(): Date {
    return this._createdAt;
  }

  /** Timestamp of the entity's most recent modification. */
  get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Advances {@link Entity.updatedAt} to the current time.
   * Call this from mutating business methods on subclasses.
   */
  protected touch(): void {
    this._updatedAt = new Date();
  }

  /**
   * Identity-based equality. Two entities are equal when they are the same
   * class instance or share the same identity.
   *
   * @param object - The entity to compare against.
   * @returns `true` when both refer to the same entity identity.
   */
  public equals(object?: Entity<T>): boolean {
    if (object === null || object === undefined) {
      return false;
    }

    if (this === object) {
      return true;
    }

    if (!(object instanceof Entity)) {
      return false;
    }

    return this._id === object._id;
  }
}
