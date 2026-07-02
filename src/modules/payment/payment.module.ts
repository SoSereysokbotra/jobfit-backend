import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { StripeAdapter } from './gateways/stripe.adapter';

@Module({ controllers: [PaymentController], providers: [PaymentService, StripeAdapter] })
export class PaymentModule {}
