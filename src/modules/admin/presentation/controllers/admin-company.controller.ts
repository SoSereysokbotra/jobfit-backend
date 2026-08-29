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

import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Company } from '@prisma/client';

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
}
