// src/common/pipes/validation.pipe.ts
//
// Generic class-validator pipe. Transforms the incoming plain object into its DTO
// class and validates it, throwing a 400 with the collected constraint messages.
// Works with any DTO decorated with class-validator; no domain coupling.
// (Nest ships a built-in ValidationPipe too — this is the doc's explicit custom one.)

import {
    ArgumentMetadata,
    BadRequestException,
    Injectable,
    PipeTransform,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
    async transform(value: any, { metatype }: ArgumentMetadata) {
        if (!metatype || !this.toValidate(metatype)) {
            return value;
        }

        const object = plainToInstance(metatype, value);
        const errors = await validate(object);

        if (errors.length > 0) {
            const messages = errors.flatMap((err) =>
                Object.values(err.constraints ?? {}),
            );
            throw new BadRequestException(messages);
        }

        return object;
    }

    private toValidate(metatype: new (...args: any[]) => any): boolean {
        const primitives: Array<new (...args: any[]) => any> = [
            String,
            Boolean,
            Number,
            Array,
            Object,
        ];
        return !primitives.includes(metatype);
    }
}
