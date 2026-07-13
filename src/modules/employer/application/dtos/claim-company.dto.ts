// src/modules/employer/application/dtos/claim-company.dto.ts
//
// Body for POST /employer/companies/claim. An employer claims an existing company and
// provides their own name (used to create the EmployerProfile that links them to it).

import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClaimCompanyDto {
  @ApiProperty({
    description: 'Id of the company being claimed.',
    format: 'uuid',
  })
  @IsUUID()
  companyId: string;

  @ApiProperty({ example: 'Jane', maxLength: 60 })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName: string;

  @ApiProperty({ example: 'Doe', maxLength: 60 })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName: string;
}
