import { ValueObject } from '@core/domain/value-object';
import { Result } from '@core/application/result';

interface EmailProps {
  value: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email extends ValueObject<EmailProps> {
  get value(): string { return this.props.value; }

  private constructor(props: EmailProps) {
    super(props);
  }

  public static create(email: string): Result<Email> {
    if (!email || !EMAIL_REGEX.test(email.trim())) {
      return Result.fail('Invalid email address');
    }
    return Result.ok(new Email({ value: email.trim().toLowerCase() }));
  }

  public toString(): string {
    return this.props.value;
  }
}
