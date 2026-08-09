import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class JobPublishedListener {
  @OnEvent('JobPublishedEvent')
  async handle(_event: any) { /* TODO: notify users with matching saved searches */ }
}
