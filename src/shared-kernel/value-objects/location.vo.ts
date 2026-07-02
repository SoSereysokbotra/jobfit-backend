import { ValueObject } from '@core/domain/value-object';
import { Result } from '@core/application/result';

interface LocationProps {
  city: string;
  country: string;
  remoteType: 'REMOTE' | 'HYBRID' | 'ON_SITE';
}

export class Location extends ValueObject<LocationProps> {
  get city(): string { return this.props.city; }
  get country(): string { return this.props.country; }
  get remoteType(): string { return this.props.remoteType; }

  private constructor(props: LocationProps) {
    super(props);
  }

  public static create(
    city: string,
    country: string,
    remoteType: 'REMOTE' | 'HYBRID' | 'ON_SITE',
  ): Result<Location> {
    if (!country.trim()) return Result.fail('Country is required');
    if (remoteType !== 'REMOTE' && !city.trim()) return Result.fail('City is required for non-remote roles');
    return Result.ok(new Location({ city, country, remoteType }));
  }

  public toString(): string {
    if (this.props.remoteType === 'REMOTE') return 'Remote';
    return `${this.props.city}, ${this.props.country}`;
  }
}
