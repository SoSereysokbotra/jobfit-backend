// src/modules/user/application/dtos/add-certification.dto.ts
//
// Dates use @IsDate + @Type(() => Date) (consistent with add-experience/add-education) so
// the service layer receives real Date objects.

import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VALIDATION } from '@common/constants/validation';

export class AddCertificationDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  issuer: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  credentialId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(VALIDATION.URL_REGEX, {
    message: 'credentialUrl must be a valid URL',
  })
  credentialUrl?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  issueDate: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expirationDate?: Date;
}
