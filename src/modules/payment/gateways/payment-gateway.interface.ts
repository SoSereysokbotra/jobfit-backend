export interface IPaymentGateway {
  createSubscription(customerId: string, priceId: string): Promise<string>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}
