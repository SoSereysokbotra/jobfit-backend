// src/modules/employer/application/dtos/company-response.dto.ts
//
// Read model returned by the employer company endpoints.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Company, CompanyVerificationMethod } from '@prisma/client';

export class EmployerCompanyResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) website: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) industry:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) size: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) foundedYear:
    number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) city: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) state: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) country: string | null;

  @ApiProperty() isVerified: boolean;
  @ApiPropertyOptional({ enum: CompanyVerificationMethod, nullable: true })
  verificationMethod: CompanyVerificationMethod | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  verifiedAt: Date | null;

  constructor(c: Company) {
    this.id = c.id;
    this.name = c.name;
    this.description = c.description;
    this.website = c.website;
    this.logoUrl = c.logoUrl;
    this.industry = c.industry;
    this.size = c.size;
    this.foundedYear = c.foundedYear;
    this.city = c.city;
    this.state = c.state;
    this.country = c.country;
    this.isVerified = c.isVerified;
    this.verificationMethod = c.verificationMethod;
    this.verifiedAt = c.verifiedAt;
  }
}
