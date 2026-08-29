// src/modules/admin/presentation/controllers/admin-company.controller.ts
//
// Company lookup for the admin panel. All routes require an ADMIN JWT.
//
// NOT IN THE ORIGINAL PLAN, and added because Phase 5 cannot work without it: approving an
// employer request requires a `companyId`, and there was no way for an admin to find one.
// `GET /companies/by-name` is an exact-name lookup built for the browser extension, and
// the admin companies screen is entirely mock-backed. So the approve dialog had nothing
// real to search.
//
// Deliberately read-only and minimal. Creating a company from the admin panel is a
// separate decision — an employer whose company is not already in the database (from the
// seed or from job ingestion) still cannot be approved.

import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
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
import { Company, Prisma } from '@prisma/client';

import { Roles } from '@common/decorators/roles.decorator';
import { PrismaService } from '@infra/prisma/prisma.service';

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

export class CreateCompanyDto {
  @ApiProperty({ example: 'Acme Robotics', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'https://acmerobotics.com' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({ example: 'technology' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;
}

export class AdminCompanyOptionDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ type: String, nullable: true }) website: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl: string | null;
  @ApiProperty() isVerified: boolean;
  @ApiProperty({
    description:
      'True when an employer already manages this company. Approving a second employer ' +
      'onto it would fail at claim, so the picker greys it out.',
  })
  isClaimed: boolean;

  constructor(
    c: Pick<Company, 'id' | 'name' | 'website' | 'logoUrl' | 'isVerified'>,
    isClaimed: boolean,
  ) {
    this.id = c.id;
    this.name = c.name;
    this.website = c.website;
    this.logoUrl = c.logoUrl;
    this.isVerified = c.isVerified;
    this.isClaimed = isClaimed;
  }
}

@ApiTags('Admin - Companies')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/companies')
export class AdminCompanyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Search companies, to pick one when approving an employer request',
  })
  @ApiOkResponse({ type: [AdminCompanyOptionDto] })
  async search(
    @Query() query: SearchCompaniesDto,
  ): Promise<AdminCompanyOptionDto[]> {
    const rows = await this.prisma.company.findMany({
      where: {
        deletedAt: null,
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' as const } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        website: true,
        logoUrl: true,
        isVerified: true,
        // One employer per company is the MVP rule, so the picker needs to know.
        _count: { select: { employers: true } },
      },
      orderBy: { name: 'asc' },
      take: query.take ?? 20,
    });

    return rows.map(
      (r) => new AdminCompanyOptionDto(r, r._count.employers > 0),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a company, so a new employer can be approved onto one',
    description:
      'A genuinely new employer usually has no company row yet — nothing has ingested a ' +
      'job for them. Without this the approve dialog is a dead end for exactly the ' +
      'employers it exists to onboard.',
  })
  @ApiOkResponse({ type: AdminCompanyOptionDto })
  @ApiResponse({ status: 409, description: 'A company with that name already exists.' })
  async create(@Body() dto: CreateCompanyDto): Promise<AdminCompanyOptionDto> {
    try {
      const created = await this.prisma.company.create({
        data: {
          name: dto.name.trim(),
          website: dto.website?.trim() || null,
          industry: dto.industry?.trim() || null,
        },
        select: {
          id: true,
          name: true,
          website: true,
          logoUrl: true,
          isVerified: true,
        },
      });
      // Brand new, so nobody can have claimed it yet.
      return new AdminCompanyOptionDto(created, false);
    } catch (err) {
      // `name` is unique. Surfaced as a conflict so the dialog can tell the admin to
      // search for the existing row instead of creating a duplicate.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `A company named "${dto.name.trim()}" already exists — search for it instead.`,
        );
      }
      throw err;
    }
  }
}
