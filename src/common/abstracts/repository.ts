// src/common/abstracts/repository.ts
//
// Minimal repository contract (see PATTERNS.md § Repository Pattern). Concrete
// repositories persist/return domain entities (never Prisma models) and may add
// entity-specific finders beyond this base.

export interface IRepository<T> {
  save(entity: T): Promise<void>;
  findById(id: string): Promise<T | null>;
  delete(id: string): Promise<void>;
}
