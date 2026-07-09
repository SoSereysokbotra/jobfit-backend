/**
 * Generic persistence contract for an aggregate/entity type.
 *
 * Implementations live in each module's infrastructure layer and translate
 * between domain objects and the persistence model.
 *
 * @typeParam T - The domain type the repository persists.
 */
export interface IRepository<T> {
  /**
   * Persists (inserts or updates) the given entity.
   * @param entity - The entity to save.
   */
  save(entity: T): Promise<void>;

  /**
   * Loads an entity by its identity.
   * @param id - The entity's unique identifier.
   * @returns The entity, or `null` when none exists.
   */
  findById(id: string): Promise<T | null>;

  /**
   * Removes an entity by its identity.
   * @param id - The entity's unique identifier.
   */
  delete(id: string): Promise<void>;
}

/**
 * Alias of {@link IRepository}, retained for existing callers.
 *
 * @typeParam T - The domain type the repository persists.
 */
export type IBaseRepository<T> = IRepository<T>;
