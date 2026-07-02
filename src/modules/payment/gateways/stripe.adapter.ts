import { Injectable } from '@nestjs/common';
import { IPaymentGateway } from './payment-gateway.interface';

@Injectable()
export class StripeAdapter implements IPaymentGateway {
  async createSubscription(customerId: string, priceId: string): Promise<string> { return ''; /* TODO */ }
  async cancelSubscription(subscriptionId: string): Promise<void> { /* TODO */ }
}
