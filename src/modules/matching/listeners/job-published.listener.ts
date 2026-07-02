import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class JobPublishedListener {
  @OnEvent('JobPublishedEvent')
  async handle(event: any) { /* TODO: trigger recompute for matching candidates */ }
}
