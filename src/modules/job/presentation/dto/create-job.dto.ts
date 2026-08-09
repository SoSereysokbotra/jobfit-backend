import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, Min, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum RemoteTypeDto {
  REMOTE = 'REMOTE',
  HYBRID = 'HYBRID',
  ON_SITE = 'ON_SITE',
}

export enum EmploymentTypeDto {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  CONTRACT = 'CONTRACT',
  TEMPORARY = 'TEMPORARY',
  FREELANCE = 'FREELANCE',
}

export enum ExperienceLevelDto {
  INTERN = 'INTERN',
  ENTRY = 'ENTRY',
  MID = 'MID',
  SENIOR = 'SENIOR',
  LEAD = 'LEAD',
  MANAGER = 'MANAGER',
  DIRECTOR = 'DIRECTOR',
  C_LEVEL = 'C_LEVEL',
}

export class CreateJobDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ enum: RemoteTypeDto })
  @IsEnum(RemoteTypeDto)
  remoteType: RemoteTypeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minSalary?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxSalary?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Responsibility bullet points.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibilities?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Qualification / requirement bullet points.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requirements?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Benefit / perk bullet points.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefits?: string[];

  @ApiPropertyOptional({ description: 'Target annual bonus, % of base (0-100).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  bonusPct?: number;

  /**
   * Optional on purpose. An employer who leaves these blank has said nothing about them,
   * and the API returns nothing — it does not fill in a plausible-looking default.
   */
  @ApiPropertyOptional({ enum: EmploymentTypeDto })
  @IsOptional()
  @IsEnum(EmploymentTypeDto)
  employmentType?: EmploymentTypeDto;

  @ApiPropertyOptional({ enum: ExperienceLevelDto })
  @IsOptional()
  @IsEnum(ExperienceLevelDto)
  experienceLevel?: ExperienceLevelDto;
}
