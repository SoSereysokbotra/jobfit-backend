import { ValueObject } from '@core/domain/value-object';
import { Result } from '@core/application/result';

type RemoteTypeValue = 'REMOTE' | 'HYBRID' | 'ON_SITE';

interface RemoteTypeProps {
  value: RemoteTypeValue;
}

export class RemoteType extends ValueObject<RemoteTypeProps> {
  get value(): RemoteTypeValue { return this.props.value; }

  private constructor(props: RemoteTypeProps) { super(props); }

  public static fromString(value: string): Result<RemoteType> {
    if (!['REMOTE', 'HYBRID', 'ON_SITE'].includes(value)) {
      return Result.fail(`Invalid remote type: ${value}. Must be REMOTE, HYBRID, or ON_SITE.`);
    }
    return Result.ok(new RemoteType({ value: value as RemoteTypeValue }));
  }

  public static remote(): RemoteType  { return new RemoteType({ value: 'REMOTE' }); }
  public static hybrid(): RemoteType  { return new RemoteType({ value: 'HYBRID' }); }
  public static onSite(): RemoteType  { return new RemoteType({ value: 'ON_SITE' }); }

  public toString(): string { return this.props.value; }
}
