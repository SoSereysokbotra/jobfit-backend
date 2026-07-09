// src/shared/kernel/value-objects/location.vo.ts

import { ValueObject } from '@common/abstracts/value-object';

export class Location extends ValueObject {
  readonly city: string;
  readonly state: string;
  readonly country: string;
  readonly latitude?: number;
  readonly longitude?: number;

  constructor(
    city: string,
    state: string,
    country: string,
    latitude?: number,
    longitude?: number,
  ) {
    super();

    if (!city || city.trim().length === 0) {
      throw new Error('City cannot be empty');
    }
    if (!country || country.trim().length === 0) {
      throw new Error('Country cannot be empty');
    }
    if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
      throw new Error('Latitude must be between -90 and 90');
    }
    if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
      throw new Error('Longitude must be between -180 and 180');
    }

    this.city = city.trim();
    this.state = (state ?? '').trim();
    this.country = country.trim();
    this.latitude = latitude;
    this.longitude = longitude;
  }

  static create(
    city: string,
    state: string,
    country: string,
    latitude?: number,
    longitude?: number,
  ): Location {
    return new Location(city, state, country, latitude, longitude);
  }

  /** Human-readable "City, State, Country" — empty parts are omitted. */
  get displayName(): string {
    return [this.city, this.state, this.country].filter(Boolean).join(', ');
  }

  toString(): string {
    return this.displayName;
  }

  toJSON() {
    return {
      city: this.city,
      state: this.state,
      country: this.country,
      latitude: this.latitude,
      longitude: this.longitude,
    };
  }
}
