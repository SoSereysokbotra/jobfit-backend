import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class ApplicationSubmittedListener {
  @OnEvent('ApplicationSubmittedEvent')
  async handle(_event: any) { /* TODO: confirm email to job seeker */ }
}
