// src/modules/auth/application/commands/register.handler.ts
// Flow 1 — Registration.

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { RegisterCommand } from './register.command';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { AuthDomainService } from '../../domain/services/auth.domain.service';
import { UserEntity } from '../../domain/entities/user.entity';
import { Password } from '../../domain/value-objects/password.value-object';
import { UserRegisteredEvent } from '../../domain/events/user-registered.event';
import {
  EmailAlreadyRegisteredError,
  WeakPasswordError,
} from '../errors/auth.errors';
import {
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_CODE_TTL_MINUTES,
} from '../auth.constants';

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly authDomain: AuthDomainService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: RegisterCommand): Promise<{ email: string }> {
    const policy = this.authDomain.validatePasswordPolicy(command.password);
    if (!policy.valid) throw new WeakPasswordError(policy.errors);

    const email = command.email.toLowerCase().trim();
    const existing = await this.userRepo.findByEmail(email);
    // Two reasons to refuse, and the SECOND one is not obvious.
    //
    // `isVerified` is the ordinary taken-address case. The role check exists because an
    // unverified row is not always a half-finished signup: approving an employer request
    // creates a real EMPLOYER row with `emailVerified: false` and an empty password hash,
    // which stays that way until the employer redeems their activation code. Falling into
    // the reuse branch below with that row would rewrite its password and hand the signup
    // an EMPLOYER-role account, because reuse never touches `role` — public signup has no
    // concept of one.
    //
    // Same error either way: distinguishing them would say whether an address is an
    // employer under review, which the intake endpoint deliberately refuses to reveal.
    if (existing && (existing.isVerified || existing.role !== 'JOB_SEEKER')) {
      throw new EmailAlreadyRegisteredError();
    }

    const passwordHash = (await Password.fromPlain(command.password)).value;
    const code = this.authDomain.generateNumericCode(VERIFICATION_CODE_LENGTH);
    const expiry = this.authDomain.computeExpiry(VERIFICATION_CODE_TTL_MINUTES);

    let user: UserEntity;
    if (existing) {
      // Re-registration of an unverified JOB_SEEKER: refresh credentials + code (same id).
      if (command.name) existing.name = command.name;
      existing.passwordHash = passwordHash;
      existing.setVerificationCode(code, expiry);
      user = existing;
    } else {
      user = UserEntity.create({
        id: uuidv4(),
        email,
        name: command.name,
        passwordHash,
      });
      user.setVerificationCode(code, expiry);
    }

    await this.userRepo.save(user);
    this.eventEmitter.emit(
      UserRegisteredEvent.eventName,
      new UserRegisteredEvent(user.id, user.email, user.name, code),
    );

    return { email: user.email };
  }
}
