import { Injectable } from '@nestjs/common';
import { IPaymentGateway } from './payment-gateway.interface';

@Injectable()
export class StripeAdapter implements IPaymentGateway {
  // Underscored: these are mandated by IPaymentGateway and unused because the adapter is
  // a stub. The names stay so the signature still documents itself.
  async createSubscription(_customerId: string, _priceId: string): Promise<string> { return ''; /* TODO */ }
  async cancelSubscription(_subscriptionId: string): Promise<void> { /* TODO */ }
}
