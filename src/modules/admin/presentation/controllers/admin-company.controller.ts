// src/modules/admin/presentation/controllers/admin-company.controller.ts
//
// Company lookup, match-checking and creation for the admin panel. ADMIN JWT throughout.
//
// Exists because approving an employer request requires a `companyId` and there was no way
// for an admin to find one: `GET /companies/by-name` is an exact-name lookup built for the
// browser extension, and the admin companies screen is mock-backed.
//
// The rules live in AdminCompanyService. In short: a shared NAME is a candidate to show, a
// shared DOMAIN is the same business and stops the write.

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { Roles } from '@common/decorators/roles.decorator';
import {
  AdminCompanyService,
  type CompanyCandidate,
  type CompanyConflictKind,
  type CompanyMatchResult,
} from '../../application/services/admin-company.service';

/* ─────────────────────────── DTOs ─────────────────────────── */

export class SearchCompaniesDto {
  @ApiPropertyOptional({ description: 'Matches the company name, case-insensitive.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  take?: number;
}

export class MatchCompanyDto {
  @ApiProperty({ example: 'Acme Robotics' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'https://acme-kh.com' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({
    example: 'hr@acme-kh.com',
    description:
      "The employer's contact address. Used as the domain when no website was given — " +
      'the website is optional and routinely skipped, the email is not. Ignored for ' +
      'consumer providers, which identify a person rather than a business.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactEmail?: string;
}

export class CreateCompanyDto {
  @ApiProperty({ example: 'Acme Robotics', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'https://acme-kh.com' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({ example: 'technology' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional({
    example: 'hr@acme-kh.com',
    description:
      "The employer's contact address, used as the domain when no website was given.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactEmail?: string;
}

export class AdminCompanyOptionDto implements CompanyCandidate {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ type: String, nullable: true }) website: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Normalized host. This, not the name, is what identifies the company.',
  })
  domain: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) city: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) country: string | null;
  @ApiProperty() isVerified: boolean;
  @ApiProperty({
    description:
      'An employer already manages this company. Approving a second onto it would fail at ' +
      'claim, so the picker greys it out.',
  })
  isClaimed: boolean;

  constructor(c: CompanyCandidate) {
    Object.assign(this, c);
  }
}

export class CompanyMatchResponseDto implements CompanyMatchResult {
  @ApiProperty({
    type: [AdminCompanyOptionDto],
    description:
      'Rows sharing the normalized name. ADVISORY — two real businesses can share a name, ' +
      'so these are candidates to show, never something to act on automatically.',
  })
  nameMatches: CompanyCandidate[];

  @ApiPropertyOptional({
    type: AdminCompanyOptionDto,
    nullable: true,
    description:
      'The company already holding this website. BLOCKING — a domain belongs to one business.',
  })
  domainMatch: CompanyCandidate | null;

  @ApiProperty({
    enum: ['NONE', 'SAME_DOMAIN_SAME_NAME', 'SAME_DOMAIN_DIFFERENT_NAME'],
  })
  conflict: CompanyConflictKind;

  @ApiPropertyOptional({ type: String, nullable: true })
  normalizedDomain: string | null;

  constructor(r: CompanyMatchResult) {
    Object.assign(this, r);
  }
}

/* ─────────────────────────── Controller ─────────────────────────── */

@ApiTags('Admin - Companies')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/companies')
export class AdminCompanyController {
  constructor(private readonly companies: AdminCompanyService) {}

  @Get()
  @ApiOperation({
    summary: 'Search companies, to pick one when approving an employer request',
  })
  @ApiOkResponse({ type: [AdminCompanyOptionDto] })
  async search(
    @Query() query: SearchCompaniesDto,
  ): Promise<AdminCompanyOptionDto[]> {
    const rows = await this.companies.search(query.search, query.take ?? 20);
    return rows.map((r) => new AdminCompanyOptionDto(r));
  }

  @Get('match')
  @ApiOperation({
    summary: 'What would a company with this name and website collide with?',
    description:
      'Asked BEFORE creating, so the admin sees candidates and conflicts instead of an ' +
      'error. `nameMatches` are advisory — two businesses can share a name. `domainMatch` ' +
      'is not: a website belongs to one business, and creating over it is refused.',
  })
  @ApiOkResponse({ type: CompanyMatchResponseDto })
  async match(@Query() query: MatchCompanyDto): Promise<CompanyMatchResponseDto> {
    return new CompanyMatchResponseDto(
      await this.companies.match(query.name, query.website, query.contactEmail),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a company, so a new employer can be approved onto one',
    description:
      'A genuinely new employer usually has no company row — nothing has ingested a job ' +
      'for them. A duplicate NAME is allowed: two businesses can share one. A duplicate ' +
      'DOMAIN is refused, and the 409 carries the existing company so the caller can offer ' +
      'the real choices.',
  })
  @ApiOkResponse({ type: AdminCompanyOptionDto })
  @ApiResponse({
    status: 409,
    description:
      'The website already belongs to a company, or an identical name exists with no ' +
      'website to tell them apart.',
  })
  async create(@Body() dto: CreateCompanyDto): Promise<AdminCompanyOptionDto> {
    return new AdminCompanyOptionDto(await this.companies.create(dto));
  }
}
