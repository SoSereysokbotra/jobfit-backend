import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class UserProfileUpdatedListener {
  @OnEvent('UserRegisteredEvent')
  async handle(event: any) { /* TODO: recompute matches on profile update */ }
}
