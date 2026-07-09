// src/common/abstracts/entity.ts
//
// Base class for domain entities (see PATTERNS.md § Entity Pattern). Provides identity
// (`id`) and lifecycle timestamps (`createdAt`, `updatedAt`). Two entities are equal when
// they share the same id. Subclasses call `super(props, id)` and assign their own fields.

import { randomUUID } from 'crypto';

export interface EntityProps {
  createdAt?: Date;
  updatedAt?: Date;
}

export abstract class Entity {
  /** Stable identity. Generated when not supplied (new entity) or passed in (rehydration). */
  readonly id: string;

  /** Set once on creation. */
  readonly createdAt: Date;

  /** Bumped by business methods whenever the entity changes. */
  updatedAt: Date;

  constructor(props?: EntityProps, id?: string) {
    this.id = id ?? randomUUID();
    this.createdAt = props?.createdAt ?? new Date();
    this.updatedAt = props?.updatedAt ?? new Date();
  }

  /** Identity equality — same concrete entity id. */
  equals(other?: Entity): boolean {
    if (other === null || other === undefined) return false;
    if (this === other) return true;
    return this.id === other.id;
  }
}
