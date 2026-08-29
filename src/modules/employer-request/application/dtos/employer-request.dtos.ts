// src/modules/employer-request/application/dtos/employer-request.dtos.ts
//
// Every DTO for the employer onboarding ticket, in one file because they are small and
// only ever read together (docs/employer_logic.md v2.1 §4, §5).

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { DomainCheckResult, EmployerRequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/* ─────────────────────────── Intake (public) ─────────────────────────── */

export class CreateEmployerRequestDto {
  @ApiProperty({ example: 'TechCorp Inc', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  companyName: string;

  @ApiProperty({
    example: 'recruiting@techcorp.com',
    description:
      'The official company address. This becomes the login address, and the activation ' +
      'code is sent here and nowhere else.',
  })
  @IsEmail()
  @MaxLength(255)
  companyEmail: string;

  @ApiProperty({ example: 'Jane Doe', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  contactName: string;

  @ApiProperty({ example: 'Head of Talent', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  contactRole: string;

  @ApiProperty({
    example: 'We hire backend and mobile engineers, 3-5 roles per quarter.',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ example: 'https://techcorp.com' })
  @IsOptional()
  @IsUrl({ require_protocol: false })
  @MaxLength(500)
  companyWebsite?: string;

  @ApiPropertyOptional({
    description:
      'Link to a business registration or similar. A URL, not an upload — the API never ' +
      'stores or serves the document itself.',
  })
  @IsOptional()
  @IsUrl({ require_protocol: false })
  @MaxLength(1000)
  supportingDocsUrl?: string;
}

/* ─────────────────────────── Admin review ─────────────────────────── */

/** The transitions an admin drives directly. APPROVED is not here — it has its own route. */
export const REVIEWABLE_STATUSES = [
  EmployerRequestStatus.REVIEWING,
  EmployerRequestStatus.PENDING_INFO,
  EmployerRequestStatus.REJECTED,
] as const;

export type ReviewableStatus = (typeof REVIEWABLE_STATUSES)[number];

export class ReviewEmployerRequestDto {
  @ApiProperty({ enum: REVIEWABLE_STATUSES })
  @IsEnum(EmployerRequestStatus)
  status: ReviewableStatus;

  @ApiPropertyOptional({
    maxLength: 2000,
    description:
      'Required when rejecting — it is emailed to the employer verbatim. A rejection with ' +
      'no reason is one they cannot act on.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;
}

export class ApproveEmployerRequestDto {
  @ApiProperty({
    description:
      'WHICH company this account is approved for. Checked again at first-login claim, so ' +
      'an employer approved for one company cannot claim another.',
  })
  @IsUUID()
  companyId: string;
}

export class ListEmployerRequestsQueryDto {
  @ApiPropertyOptional({ enum: EmployerRequestStatus })
  @IsOptional()
  @IsEnum(EmployerRequestStatus)
  status?: EmployerRequestStatus;

  @ApiPropertyOptional({ description: 'Matches company name or contact email.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

/* ─────────────────────────── Activation (public) ─────────────────────────── */

export class ActivateEmployerAccountDto {
  @ApiProperty({ example: 'recruiting@techcorp.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '048213', minLength: 6, maxLength: 6 })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty({
    example: 'S3curePass',
    minLength: 8,
    maxLength: 72, // bcrypt truncates beyond 72 bytes
    description: 'Min 8 chars, must include upper, lower and a number.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter.' })
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter.' })
  @Matches(/[0-9]/, { message: 'Password must contain a number.' })
  password: string;
}

/* ─────────────────────────── Responses ─────────────────────────── */

/** What the public intake form gets back. Deliberately says nothing about review state. */
export class EmployerRequestReceiptDto {
  @ApiProperty() id: string;
  @ApiProperty() message: string;

  constructor(id: string) {
    this.id = id;
    this.message =
      'Thanks — your request has been received. We review new employers within two ' +
      'business days and will email you at the address you gave us.';
  }
}

export class EmployerRequestDto {
  @ApiProperty() id: string;
  @ApiProperty() companyName: string;
  @ApiProperty() companyEmail: string;
  @ApiProperty() contactName: string;
  @ApiProperty() contactRole: string;
  @ApiProperty() description: string;
  @ApiPropertyOptional() companyWebsite?: string;
  @ApiPropertyOptional() supportingDocsUrl?: string;
  @ApiProperty({ enum: EmployerRequestStatus }) status: EmployerRequestStatus;
  @ApiPropertyOptional() adminNotes?: string;
  @ApiPropertyOptional() reviewedByAdminId?: string;
  @ApiPropertyOptional() reviewedAt?: string;
  @ApiPropertyOptional() approvedUserId?: string;
  @ApiPropertyOptional() approvedCompanyId?: string;
  @ApiProperty() createdAt: string;

  @ApiProperty({
    description:
      'True when the contact address is on a free consumer domain. Computed per request, ' +
      'never stored — a stored flag would go stale the moment the provider list changes.',
  })
  isPublicDomain: boolean;

  @ApiProperty({
    description:
      'Hours since submission, for requests still awaiting a decision. Null once decided. ' +
      'The 48-hour SLA is read off this.',
  })
  hoursAwaitingDecision: number | null;

  @ApiProperty({ description: 'hoursAwaitingDecision > 48.' })
  breachesSla: boolean;

  @ApiPropertyOptional({
    enum: DomainCheckResult,
    description:
      'What the automated email-domain check found at first-login claim, or null if the ' +
      'employer has not claimed yet. ADVISORY — the admin approval is what verified the ' +
      'company. MISMATCH or NO_WEBSITE is worth a second look, not a block.',
  })
  domainCheck?: DomainCheckResult;

  constructor(init: EmployerRequestDto) {
    Object.assign(this, init);
  }
}

export class EmployerRequestListDto {
  @ApiProperty({ type: [EmployerRequestDto] }) items: EmployerRequestDto[];
  @ApiProperty() total: number;

  constructor(items: EmployerRequestDto[], total: number) {
    this.items = items;
    this.total = total;
  }
}

export class EmployerRequestMessageDto {
  @ApiProperty() message: string;
  constructor(message: string) {
    this.message = message;
  }
}
