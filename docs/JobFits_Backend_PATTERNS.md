# JobFits Backend - Code Patterns & Templates

**Use this file as your copy-paste reference.**

Every time you build a module (User, Job, Company, etc.), use these exact patterns.  
Just replace `[Entity]` with your entity name.

---

# TABLE OF CONTENTS

1. [Entity Pattern](#entity-pattern) - Domain model
2. [Value Object Pattern](#value-object-pattern) - Immutable objects
3. [Domain Event Pattern](#domain-event-pattern) - Events
4. [Repository Pattern](#repository-pattern) - Data access
5. [Service Pattern](#service-pattern) - Business logic
6. [DTO Pattern](#dto-pattern) - Validation
7. [Controller Pattern](#controller-pattern) - API endpoints
8. [Error Handling Pattern](#error-handling-pattern) - Exceptions
9. [Module Pattern](#module-pattern) - NestJS module
10. [Unit Test Pattern](#unit-test-pattern) - Service tests
11. [Integration Test Pattern](#integration-test-pattern) - Flow tests
12. [Prisma Query Pattern](#prisma-query-pattern) - Database queries

---

# 1. ENTITY PATTERN

## Basic Entity (Not an Aggregate)

```typescript
// src/modules/[entity]/domain/entities/[entity].entity.ts

import { Entity } from '@core/domain/entity';

export class [Entity] extends Entity {
  // Properties
  property1: string;
  property2: number;
  property3?: string;

  constructor(
    props: {
      property1: string;
      property2: number;
      property3?: string;
    },
    id?: string,
  ) {
    super(props, id);
    this.property1 = props.property1;
    this.property2 = props.property2;
    this.property3 = props.property3;
  }

  // Factory method
  static create(props: {
    property1: string;
    property2: number;
    property3?: string;
  }): [Entity] {
    return new [Entity](props);
  }

  // Business logic methods
  updateProperty1(newValue: string): void {
    if (!newValue || newValue.trim().length === 0) {
      throw new Error('Property1 cannot be empty');
    }
    this.property1 = newValue;
    this.updatedAt = new Date();
  }

  isValid(): boolean {
    return this.property1.length > 0 && this.property2 > 0;
  }
}
```

---

## Aggregate Root (With Domain Events)

```typescript
// src/modules/[entity]/domain/entities/[aggregate].entity.ts

import { AggregateRoot } from '@core/domain/aggregate-root';
import { [Entity]CreatedEvent } from '../events/[entity]-created.event';
import { [Entity]UpdatedEvent } from '../events/[entity]-updated.event';

export class [Aggregate] extends AggregateRoot {
  // Properties
  property1: string;
  property2: number;
  property3?: string;
  status: string;

  constructor(
    props: {
      property1: string;
      property2: number;
      property3?: string;
      status?: string;
    },
    id?: string,
  ) {
    super(props, id);
    this.property1 = props.property1;
    this.property2 = props.property2;
    this.property3 = props.property3;
    this.status = props.status || 'ACTIVE';
  }

  // Factory method - emits creation event
  static create(props: {
    property1: string;
    property2: number;
    property3?: string;
  }): [Aggregate] {
    const aggregate = new [Aggregate](props);
    
    // Emit event
    aggregate.addDomainEvent(
      new [Entity]CreatedEvent(
        aggregate.id,
        aggregate.property1,
        aggregate.property2,
      ),
    );
    
    return aggregate;
  }

  // Business logic - emits update event
  updateProperty1(newValue: string): void {
    if (!newValue || newValue.trim().length === 0) {
      throw new Error('Property1 cannot be empty');
    }
    
    const oldValue = this.property1;
    this.property1 = newValue;
    this.updatedAt = new Date();

    // Emit event
    this.addDomainEvent(
      new [Entity]UpdatedEvent(
        this.id,
        'property1',
        oldValue,
        newValue,
      ),
    );
  }

  changeStatus(newStatus: string): void {
    if (!['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(newStatus)) {
      throw new Error('Invalid status');
    }
    
    const oldStatus = this.status;
    this.status = newStatus;
    this.updatedAt = new Date();

    this.addDomainEvent(
      new [Entity]UpdatedEvent(
        this.id,
        'status',
        oldStatus,
        newStatus,
      ),
    );
  }

  isValid(): boolean {
    return this.property1.length > 0 && this.property2 > 0;
  }
}
```

---

# 2. VALUE OBJECT PATTERN

## Simple Value Object

```typescript
// src/shared/kernel/value-objects/[value-object].vo.ts

import { ValueObject } from '@core/domain/value-object';

export class [ValueObject] extends ValueObject {
  readonly value: string;

  constructor(value: string) {
    super();
    
    if (!value || value.trim().length === 0) {
      throw new Error('[ValueObject] cannot be empty');
    }
    
    if (!this.isValid(value)) {
      throw new Error('[ValueObject] format is invalid');
    }

    this.value = value;
  }

  static create(value: string): [ValueObject] {
    return new [ValueObject](value);
  }

  private isValid(value: string): boolean {
    // Add validation logic
    return true;
  }

  toString(): string {
    return this.value;
  }
}
```

---

## Complex Value Object

```typescript
// src/shared/kernel/value-objects/[complex].vo.ts

import { ValueObject } from '@core/domain/value-object';

export class [Complex] extends ValueObject {
  readonly property1: string;
  readonly property2: number;
  readonly property3: string;

  constructor(
    property1: string,
    property2: number,
    property3: string,
  ) {
    super();

    if (!property1 || property1.trim().length === 0) {
      throw new Error('Property1 cannot be empty');
    }

    if (property2 < 0) {
      throw new Error('Property2 cannot be negative');
    }

    this.property1 = property1;
    this.property2 = property2;
    this.property3 = property3;
  }

  static create(
    property1: string,
    property2: number,
    property3: string,
  ): [Complex] {
    return new [Complex](property1, property2, property3);
  }

  get displayName(): string {
    return `${this.property1} - ${this.property2}`;
  }

  equals(other: [Complex]): boolean {
    return (
      this.property1 === other.property1 &&
      this.property2 === other.property2 &&
      this.property3 === other.property3
    );
  }

  toJSON() {
    return {
      property1: this.property1,
      property2: this.property2,
      property3: this.property3,
    };
  }
}
```

---

# 3. DOMAIN EVENT PATTERN

## Event Definition

```typescript
// src/modules/[entity]/domain/events/[entity]-[action].event.ts

import { DomainEvent } from '@core/domain/domain-event';

export class [Entity]CreatedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public property1: string,
    public property2: number,
  ) {
    super(aggregateId);
  }
}
```

---

## Event Registry (Update as you add events)

```typescript
// src/events/domain-events.registry.ts

export const DOMAIN_EVENTS = {
  // User Module
  USER_CREATED: 'UserCreatedEvent',
  PROFILE_UPDATED: 'ProfileUpdatedEvent',
  SKILL_ADDED: 'SkillAddedEvent',

  // Job Module
  JOB_CREATED: 'JobCreatedEvent',
  JOB_CLOSED: 'JobClosedEvent',

  // Resume Module
  RESUME_UPLOADED: 'ResumeUploadedEvent',
  RESUME_PARSED: 'ResumeParsedEvent',

  // Application Module
  APPLICATION_SUBMITTED: 'ApplicationSubmittedEvent',
  APPLICATION_STATUS_CHANGED: 'ApplicationStatusChangedEvent',

  // Add more as you create them...
};
```

---

## Event Listener (Subscription)

```typescript
// src/modules/[entity]/infrastructure/listeners/[entity]-created.listener.ts

import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEventBus } from '@/events/domain-event-bus.service';
import { [Entity]CreatedEvent } from '../../domain/events/[entity]-created.event';

@Injectable()
export class [Entity]CreatedListener implements OnModuleInit {
  constructor(
    private eventBus: DomainEventBus,
    private notificationService: NotificationService,  // Example dependency
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('[Entity]CreatedEvent', (event: [Entity]CreatedEvent) =>
      this.handle(event),
    );
  }

  private async handle(event: [Entity]CreatedEvent): Promise<void> {
    try {
      // Do something when event fires
      console.log(`[Entity] created: ${event.aggregateId}`);
      
      // Example: Send notification
      await this.notificationService.send({
        type: 'ENTITY_CREATED',
        aggregateId: event.aggregateId,
        data: event,
      });
    } catch (error) {
      console.error('Error handling [Entity]CreatedEvent', error);
      // Don't throw - let other listeners run
    }
  }
}
```

---

# 4. REPOSITORY PATTERN

## Repository Interface

```typescript
// src/core/repository/base-repository.interface.ts

export interface IRepository<T> {
  save(entity: T): Promise<void>;
  findById(id: string): Promise<T | null>;
  delete(id: string): Promise<void>;
}
```

---

## Repository Implementation

```typescript
// src/modules/[entity]/infrastructure/repositories/[entity].repository.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/database/prisma.service';
import { [Entity] } from '../../domain/entities/[entity].entity';
import { IRepository } from '@core/repository/base-repository.interface';

@Injectable()
export class [Entity]Repository implements IRepository<[Entity]> {
  constructor(private prisma: PrismaService) {}

  async save(entity: [Entity]): Promise<void> {
    await this.prisma.[entity].upsert({
      where: { id: entity.id },
      update: {
        property1: entity.property1,
        property2: entity.property2,
        property3: entity.property3,
        updatedAt: entity.updatedAt,
      },
      create: {
        id: entity.id,
        property1: entity.property1,
        property2: entity.property2,
        property3: entity.property3,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      },
    });
  }

  async findById(id: string): Promise<[Entity] | null> {
    const data = await this.prisma.[entity].findUnique({
      where: { id },
    });

    if (!data) return null;

    return this.mapToDomain(data);
  }

  async findByIds(ids: string[]): Promise<[Entity][]> {
    const data = await this.prisma.[entity].findMany({
      where: { id: { in: ids } },
    });

    return data.map(item => this.mapToDomain(item));
  }

  async findAll(
    skip: number = 0,
    take: number = 20,
  ): Promise<[Entity][]> {
    const data = await this.prisma.[entity].findMany({
      where: { deletedAt: null },  // Soft delete filter
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });

    return data.map(item => this.mapToDomain(item));
  }

  async delete(id: string): Promise<void> {
    // Soft delete
    await this.prisma.[entity].update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async permanentDelete(id: string): Promise<void> {
    // Hard delete (use carefully!)
    await this.prisma.[entity].delete({
      where: { id },
    });
  }

  private mapToDomain(raw: any): [Entity] {
    return new [Entity](
      {
        property1: raw.property1,
        property2: raw.property2,
        property3: raw.property3,
      },
      raw.id,
    );
  }
}
```

---

## Repository with Relations

```typescript
// Example: If [Entity] has relations

async findByIdWithRelations(id: string): Promise<[Entity] | null> {
  const data = await this.prisma.[entity].findUnique({
    where: { id },
    include: {
      relatedEntity: true,
      anotherRelation: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!data) return null;

  return this.mapToDomain(data);
}

async findByFilter(filter: {
  property1?: string;
  property2?: number;
}): Promise<[Entity][]> {
  const data = await this.prisma.[entity].findMany({
    where: {
      deletedAt: null,
      ...(filter.property1 && { property1: filter.property1 }),
      ...(filter.property2 && { property2: filter.property2 }),
    },
    orderBy: { createdAt: 'desc' },
  });

  return data.map(item => this.mapToDomain(item));
}

async count(filter?: any): Promise<number> {
  return this.prisma.[entity].count({
    where: {
      deletedAt: null,
      ...filter,
    },
  });
}
```

---

# 5. SERVICE PATTERN

## Basic Service

```typescript
// src/modules/[entity]/application/services/[entity].service.ts

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { [Entity]Repository } from '../../infrastructure/repositories/[entity].repository';
import { [Entity] } from '../../domain/entities/[entity].entity';
import { Create[Entity]Dto } from '../dtos/create-[entity].dto';
import { Update[Entity]Dto } from '../dtos/update-[entity].dto';

@Injectable()
export class [Entity]Service {
  constructor(
    private [entity]Repository: [Entity]Repository,
  ) {}

  async create[Entity](dto: Create[Entity]Dto): Promise<[Entity]> {
    // Validate business rules
    const existing = await this.[entity]Repository.findById(dto.id);
    if (existing) {
      throw new BadRequestException('[Entity] already exists');
    }

    // Create entity
    const [entity] = [Entity].create({
      property1: dto.property1,
      property2: dto.property2,
      property3: dto.property3,
    });

    // Save to repository
    await this.[entity]Repository.save([entity]);

    return [entity];
  }

  async get[Entity]ById(id: string): Promise<[Entity]> {
    const [entity] = await this.[entity]Repository.findById(id);

    if (!entity) {
      throw new NotFoundException(`[Entity] with id ${id} not found`);
    }

    return [entity];
  }

  async getAll[Entity]s(skip: number = 0, take: number = 20): Promise<[Entity][]> {
    return this.[entity]Repository.findAll(skip, take);
  }

  async update[Entity](id: string, dto: Update[Entity]Dto): Promise<[Entity]> {
    const [entity] = await this.get[Entity]ById(id);

    // Update properties
    if (dto.property1 !== undefined) {
      [entity].updateProperty1(dto.property1);
    }

    // Save updated entity
    await this.[entity]Repository.save([entity]);

    return [entity];
  }

  async delete[Entity](id: string): Promise<void> {
    await this.get[Entity]ById(id);  // Verify exists
    await this.[entity]Repository.delete(id);
  }
}
```

---

## Service with Events

```typescript
// src/modules/[entity]/application/services/[entity].service.ts

import { Injectable } from '@nestjs/common';
import { DomainEventBus } from '@/events/domain-event-bus.service';
import { [Entity]Repository } from '../../infrastructure/repositories/[entity].repository';
import { [Entity] } from '../../domain/entities/[entity].entity';

@Injectable()
export class [Entity]Service {
  constructor(
    private [entity]Repository: [Entity]Repository,
    private eventBus: DomainEventBus,
  ) {}

  async create[Entity](dto: any): Promise<[Entity]> {
    // Create aggregate (which emits events)
    const [entity] = [Entity].create(dto);

    // Save to database
    await this.[entity]Repository.save([entity]);

    // Publish domain events
    const events = [entity].getDomainEvents();
    for (const event of events) {
      await this.eventBus.publish(event);
    }

    // Clear events
    [entity].clearDomainEvents();

    return [entity];
  }

  async update[Entity](id: string, dto: any): Promise<[Entity]> {
    const [entity] = await this.[entity]Repository.findById(id);
    if (!entity) throw new NotFoundException('[Entity] not found');

    // Update (which emits events)
    [entity].updateProperty1(dto.property1);

    // Save
    await this.[entity]Repository.save([entity]);

    // Publish events
    const events = [entity].getDomainEvents();
    for (const event of events) {
      await this.eventBus.publish(event);
    }

    [entity].clearDomainEvents();

    return [entity];
  }
}
```

---

# 6. DTO PATTERN

## Create DTO

```typescript
// src/modules/[entity]/application/dtos/create-[entity].dto.ts

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  IsEmail,
  IsEnum,
  IsArray,
  IsNumber,
} from 'class-validator';

export class Create[Entity]Dto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  property1: string;

  @IsNotEmpty()
  @IsNumber()
  property2: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  property3?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE'])
  status?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
```

---

## Update DTO (All fields optional)

```typescript
// src/modules/[entity]/application/dtos/update-[entity].dto.ts

import { PartialType } from '@nestjs/mapped-types';
import { Create[Entity]Dto } from './create-[entity].dto';

export class Update[Entity]Dto extends PartialType(Create[Entity]Dto) {}
```

---

## Response DTO (What API returns)

```typescript
// src/modules/[entity]/application/dtos/[entity]-response.dto.ts

export class [Entity]ResponseDto {
  id: string;
  property1: string;
  property2: number;
  property3?: string;
  createdAt: Date;
  updatedAt: Date;

  constructor([entity]: [Entity]) {
    this.id = [entity].id;
    this.property1 = [entity].property1;
    this.property2 = [entity].property2;
    this.property3 = [entity].property3;
    this.createdAt = [entity].createdAt;
    this.updatedAt = [entity].updatedAt;
  }
}
```

---

# 7. CONTROLLER PATTERN

## Basic Controller

```typescript
// src/modules/[entity]/presentation/controllers/[entity].controller.ts

import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { [Entity]Service } from '../../application/services/[entity].service';
import { Create[Entity]Dto } from '../../application/dtos/create-[entity].dto';
import { Update[Entity]Dto } from '../../application/dtos/update-[entity].dto';
import { [Entity]ResponseDto } from '../../application/dtos/[entity]-response.dto';
import { SupabaseAuthGuard } from '@/common/guards/supabase-auth.guard';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@Controller('[entities]')
export class [Entity]Controller {
  constructor(private [entity]Service: [Entity]Service) {}

  @Post()
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create[Entity](
    @Body() dto: Create[Entity]Dto,
    @CurrentUser() user: any,
  ): Promise<[Entity]ResponseDto> {
    const [entity] = await this.[entity]Service.create[Entity](dto);
    return new [Entity]ResponseDto([entity]);
  }

  @Get(':id')
  @Public()
  async get[Entity](@Param('id') id: string): Promise<[Entity]ResponseDto> {
    const [entity] = await this.[entity]Service.get[Entity]ById(id);
    return new [Entity]ResponseDto([entity]);
  }

  @Get()
  @Public()
  async getAll(
    @Query('skip') skip: string = '0',
    @Query('take') take: string = '20',
  ): Promise<[Entity]ResponseDto[]> {
    const skipNum = parseInt(skip, 10) || 0;
    const takeNum = Math.min(parseInt(take, 10) || 20, 100);

    const [entities] = await this.[entity]Service.getAll[Entity]s(skipNum, takeNum);

    return [entities].map(e => new [Entity]ResponseDto(e));
  }

  @Patch(':id')
  @UseGuards(SupabaseAuthGuard)
  async update[Entity](
    @Param('id') id: string,
    @Body() dto: Update[Entity]Dto,
  ): Promise<[Entity]ResponseDto> {
    const [entity] = await this.[entity]Service.update[Entity](id, dto);
    return new [Entity]ResponseDto([entity]);
  }

  @Delete(':id')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete[Entity](@Param('id') id: string): Promise<void> {
    await this.[entity]Service.delete[Entity](id);
  }
}
```

---

## Controller with Custom Logic

```typescript
// Example: Search endpoint

@Get('search')
@Public()
async search(
  @Query('q') query: string,
  @Query('filter') filter?: string,
  @Query('limit') limit: string = '20',
): Promise<[Entity]ResponseDto[]> {
  if (!query) {
    throw new BadRequestException('Search query required');
  }

  const results = await this.[entity]Service.search[Entity]s(query, {
    filter: filter ? JSON.parse(filter) : undefined,
    limit: parseInt(limit, 10),
  });

  return results.map(e => new [Entity]ResponseDto(e));
}
```

---

# 8. ERROR HANDLING PATTERN

## Global Exception Filter

```typescript
// src/common/filters/global-exception.filter.ts

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      message = exception.message;
    } else {
      this.logger.error('Unknown error', exception);
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

---

## Service Error Handling

```typescript
// In service methods

async get[Entity]ById(id: string): Promise<[Entity]> {
  if (!id || id.trim().length === 0) {
    throw new BadRequestException('ID is required');
  }

  const [entity] = await this.[entity]Repository.findById(id);

  if (!entity) {
    throw new NotFoundException(
      `[Entity] with id ${id} not found`,
    );
  }

  return [entity];
}

async create[Entity](dto: Create[Entity]Dto): Promise<[Entity]> {
  try {
    // Validation
    if (!dto.property1 || dto.property1.trim().length === 0) {
      throw new BadRequestException('Property1 is required');
    }

    // Business rule validation
    const existing = await this.[entity]Repository.findById(dto.id);
    if (existing) {
      throw new BadRequestException('[Entity] already exists with this ID');
    }

    // Create and save
    const [entity] = [Entity].create(dto);
    await this.[entity]Repository.save([entity]);

    return [entity];
  } catch (error) {
    // If already an HttpException, throw as-is
    if (error instanceof HttpException) {
      throw error;
    }

    // Log unexpected errors
    console.error('Error creating [Entity]:', error);

    throw new InternalServerErrorException(
      'Failed to create [Entity]',
    );
  }
}
```

---

## Custom Exceptions

```typescript
// src/common/exceptions/custom.exception.ts

import { HttpException, HttpStatus } from '@nestjs/common';

export class EntityNotFoundException extends HttpException {
  constructor(entityName: string, identifier: string) {
    super(
      `${entityName} with identifier ${identifier} not found`,
      HttpStatus.NOT_FOUND,
    );
  }
}

export class EntityAlreadyExistsException extends HttpException {
  constructor(entityName: string) {
    super(
      `${entityName} already exists`,
      HttpStatus.CONFLICT,
    );
  }
}

export class InvalidBusinessRuleException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

// Usage:
throw new EntityNotFoundException('[Entity]', id);
throw new EntityAlreadyExistsException('[Entity]');
throw new InvalidBusinessRuleException('Cannot update completed [entity]');
```

---

# 9. MODULE PATTERN

## Feature Module

```typescript
// src/modules/[entity]/[entity].module.ts

import { Module } from '@nestjs/common';
import { [Entity]Service } from './application/services/[entity].service';
import { [Entity]Repository } from './infrastructure/repositories/[entity].repository';
import { [Entity]Controller } from './presentation/controllers/[entity].controller';
import { [Entity]CreatedListener } from './infrastructure/listeners/[entity]-created.listener';

@Module({
  controllers: [[Entity]Controller],
  providers: [
    [Entity]Service,
    [Entity]Repository,
    [Entity]CreatedListener,  // Event listener
  ],
  exports: [[Entity]Service, [Entity]Repository],
})
export class [Entity]Module {}
```

---

## Import Module in AppModule

```typescript
// src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { [Entity]Module } from './modules/[entity]/[entity].module';
import { User Module } from './modules/user/user.module';
import { Job Module } from './modules/job/job.module';
import { DomainEventBus } from './events/domain-event-bus.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Core
    [Entity]Module,
    UserModule,
    JobModule,
    // Add other modules...
  ],
  providers: [
    DomainEventBus,
    {
      provide: 'APP_FILTER',
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
```

---

# 10. UNIT TEST PATTERN

## Service Tests

```typescript
// src/modules/[entity]/application/services/[entity].service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { [Entity]Service } from './[entity].service';
import { [Entity]Repository } from '../../infrastructure/repositories/[entity].repository';
import { DomainEventBus } from '@/events/domain-event-bus.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('[Entity]Service', () => {
  let service: [Entity]Service;
  let mockRepository: jest.Mocked<[Entity]Repository>;
  let mockEventBus: jest.Mocked<DomainEventBus>;

  beforeEach(async () => {
    // Create mocks
    mockRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockEventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
    } as any;

    // Create module
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        [Entity]Service,
        {
          provide: [Entity]Repository,
          useValue: mockRepository,
        },
        {
          provide: DomainEventBus,
          useValue: mockEventBus,
        },
      ],
    }).compile();

    service = module.get<[Entity]Service>([Entity]Service);
  });

  describe('create[Entity]', () => {
    it('should create [entity] successfully', async () => {
      // Arrange
      const dto = {
        property1: 'test',
        property2: 123,
      };
      mockRepository.save.mockResolvedValue(undefined);

      // Act
      const result = await service.create[Entity](dto);

      // Assert
      expect(result.property1).toBe('test');
      expect(result.property2).toBe(123);
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalled();
    });

    it('should throw error if property1 is empty', async () => {
      // Arrange
      const dto = {
        property1: '',
        property2: 123,
      };

      // Act & Assert
      await expect(service.create[Entity](dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('get[Entity]ById', () => {
    it('should return [entity] when found', async () => {
      // Arrange
      const id = 'test-id';
      const mockEntity = {
        id,
        property1: 'test',
        property2: 123,
      } as any;
      mockRepository.findById.mockResolvedValue(mockEntity);

      // Act
      const result = await service.get[Entity]ById(id);

      // Assert
      expect(result).toEqual(mockEntity);
      expect(mockRepository.findById).toHaveBeenCalledWith(id);
    });

    it('should throw NotFoundException when not found', async () => {
      // Arrange
      const id = 'non-existent';
      mockRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.get[Entity]ById(id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete[Entity]', () => {
    it('should delete [entity] successfully', async () => {
      // Arrange
      const id = 'test-id';
      const mockEntity = { id, property1: 'test' } as any;
      mockRepository.findById.mockResolvedValue(mockEntity);
      mockRepository.delete.mockResolvedValue(undefined);

      // Act
      await service.delete[Entity](id);

      // Assert
      expect(mockRepository.delete).toHaveBeenCalledWith(id);
    });
  });
});
```

---

## Repository Tests

```typescript
// src/modules/[entity]/infrastructure/repositories/[entity].repository.spec.ts

import { Test } from '@nestjs/testing';
import { [Entity]Repository } from './[entity].repository';
import { PrismaService } from '@/infrastructure/database/prisma.service';

describe('[Entity]Repository', () => {
  let repository: [Entity]Repository;
  let mockPrisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    mockPrisma = {
      [entity]: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        [Entity]Repository,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    repository = module.get<[Entity]Repository>([Entity]Repository);
  });

  describe('save', () => {
    it('should save [entity] to database', async () => {
      // Arrange
      const entity = new [Entity](
        {
          property1: 'test',
          property2: 123,
        },
        'test-id',
      );

      // Act
      await repository.save(entity);

      // Assert
      expect(mockPrisma.[entity].upsert).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return [entity] when found', async () => {
      // Arrange
      const rawData = {
        id: 'test-id',
        property1: 'test',
        property2: 123,
      };
      mockPrisma.[entity].findUnique.mockResolvedValue(rawData);

      // Act
      const result = await repository.findById('test-id');

      // Assert
      expect(result).not.toBeNull();
      expect(result.property1).toBe('test');
    });

    it('should return null when not found', async () => {
      // Arrange
      mockPrisma.[entity].findUnique.mockResolvedValue(null);

      // Act
      const result = await repository.findById('non-existent');

      // Assert
      expect(result).toBeNull();
    });
  });
});
```

---

# 11. INTEGRATION TEST PATTERN

## Multi-Module Flow Test

```typescript
// src/modules/[entity]/application/services/[entity].service.integration.spec.ts

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/infrastructure/database/prisma.service';
import { [Entity]Service } from './[entity].service';

describe('[Entity] Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let [entity]Service: [Entity]Service;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    prisma = module.get<PrismaService>(PrismaService);
    [entity]Service = module.get<[Entity]Service>([Entity]Service);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean database
    await prisma.[entity].deleteMany({});
  });

  describe('[Entity] Flow', () => {
    it('should complete full [entity] lifecycle', async () => {
      // 1. Create [entity]
      const created = await [entity]Service.create[Entity]({
        property1: 'test',
        property2: 123,
      });

      expect(created).toBeDefined();
      expect(created.property1).toBe('test');

      // 2. Get [entity]
      const fetched = await [entity]Service.get[Entity]ById(created.id);
      expect(fetched).toBeDefined();
      expect(fetched.property1).toBe('test');

      // 3. Update [entity]
      const updated = await [entity]Service.update[Entity](created.id, {
        property1: 'updated',
      });
      expect(updated.property1).toBe('updated');

      // 4. Delete [entity]
      await [entity]Service.delete[Entity](created.id);

      // 5. Verify deleted
      const deleted = await prisma.[entity].findUnique({
        where: { id: created.id },
      });
      expect(deleted.deletedAt).not.toBeNull();
    });

    it('should handle concurrent operations', async () => {
      const promises = Array.from({ length: 10 }).map((_, i) =>
        [entity]Service.create[Entity]({
          property1: `test-${i}`,
          property2: i,
        }),
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(results.every(r => r !== null)).toBe(true);
    });
  });
});
```

---

# 12. PRISMA QUERY PATTERN

## Basic Queries

```typescript
// In repository

// Find one
const entity = await this.prisma.[entity].findUnique({
  where: { id: 'test-id' },
});

// Find many with filters
const entities = await this.prisma.[entity].findMany({
  where: {
    status: 'ACTIVE',
    createdAt: { gte: new Date('2026-01-01') },
    deletedAt: null,  // Soft delete filter
  },
  orderBy: { createdAt: 'desc' },
  skip: 0,
  take: 20,
});

// Count
const count = await this.prisma.[entity].count({
  where: { deletedAt: null },
});

// Update
await this.prisma.[entity].update({
  where: { id: 'test-id' },
  data: { property1: 'new value' },
});

// Upsert (update or create)
await this.prisma.[entity].upsert({
  where: { id: 'test-id' },
  create: { id: 'test-id', property1: 'value' },
  update: { property1: 'new value' },
});

// Delete (hard delete)
await this.prisma.[entity].delete({
  where: { id: 'test-id' },
});
```

---

## Advanced Queries

```typescript
// With relations
const entity = await this.prisma.[entity].findUnique({
  where: { id: 'test-id' },
  include: {
    relatedEntity: true,
    anotherRelation: {
      select: { id: true, name: true },
      where: { active: true },
      orderBy: { name: 'asc' },
    },
  },
});

// Full-text search (Postgres)
const results = await this.prisma.[entity].findMany({
  where: {
    OR: [
      { property1: { search: 'query' } },
      { property2: { search: 'query' } },
    ],
  },
});

// Aggregate
const stats = await this.prisma.[entity].aggregate({
  where: { deletedAt: null },
  _count: true,
  _avg: { property2: true },
  _max: { property2: true },
  _min: { property2: true },
});

// GroupBy
const grouped = await this.prisma.[entity].groupBy({
  by: ['status'],
  _count: { id: true },
  where: { deletedAt: null },
});

// Distinct
const distinct = await this.prisma.[entity].findMany({
  distinct: ['property1'],
  select: { property1: true },
});
```

---

## Raw Queries (When needed)

```typescript
// Raw SQL
const results = await this.prisma.$queryRaw`
  SELECT * FROM [entity] WHERE property1 = ${value}
`;

// Raw execute
await this.prisma.$executeRaw`
  UPDATE [entity] SET property1 = ${newValue} WHERE id = ${id}
`;
```

---

# COMMON PATTERNS CHECKLIST

✅ **Always include in every Entity:**
- `constructor` with props
- `static create()` factory method
- `isValid()` method
- Business logic methods

✅ **Always include in every Repository:**
- `save(entity)`
- `findById(id)`
- `findAll(skip, take)` with soft delete filter
- `delete(id)` for soft delete
- `mapToDomain(raw)` private method

✅ **Always include in every Service:**
- `create[Entity](dto)` - creates entity
- `get[Entity]ById(id)` - gets single
- `getAll[Entity]s(skip, take)` - lists
- `update[Entity](id, dto)` - updates
- `delete[Entity](id)` - deletes

✅ **Always include in every Controller:**
- `@Post()` create endpoint
- `@Get(':id')` get single endpoint
- `@Get()` list endpoint
- `@Patch(':id')` update endpoint
- `@Delete(':id')` delete endpoint
- `@UseGuards(SupabaseAuthGuard)` on mutation endpoints
- `@Public()` on read endpoints (optional)

✅ **Always include in every DTO:**
- Validation decorators on all fields
- `@IsNotEmpty()` on required fields
- `@IsOptional()` on optional fields
- Correct types (string, number, enum, etc.)

✅ **Always include in Tests:**
- Setup/teardown (beforeEach, afterAll)
- Mock dependencies
- Arrange-Act-Assert pattern
- Happy path test
- Error case test
- Edge case test

---

# QUICK COPY-PASTE HEADERS

When creating new files, start with these headers:

```typescript
// Entity
import { Entity } from '@core/domain/entity';
import { AggregateRoot } from '@core/domain/aggregate-root';

// Service
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DomainEventBus } from '@/events/domain-event-bus.service';

// Repository
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/database/prisma.service';

// Controller
import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '@/common/guards/supabase-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

// DTO
import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength, IsEnum, IsArray } from 'class-validator';

// Module
import { Module } from '@nestjs/common';

// Test
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
```

---

**Generated:** July 2026  
**Version:** 1.0  
**Status:** Ready to use

🎯 **Copy these patterns. Replace `[Entity]` with your entity name. Done!**

