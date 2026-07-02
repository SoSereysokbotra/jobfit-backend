import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationService {
  async sendEmail(to: string, subject: string, body: string) { /* TODO */ }
  async createInAppNotification(userId: string, message: string) { /* TODO */ }
}
