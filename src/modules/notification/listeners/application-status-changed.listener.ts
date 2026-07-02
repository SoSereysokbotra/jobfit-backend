import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class ApplicationStatusChangedListener {
  @OnEvent('ApplicationStatusChangedEvent')
  async handle(event: any) { /* TODO: notify candidate of status update */ }
}
