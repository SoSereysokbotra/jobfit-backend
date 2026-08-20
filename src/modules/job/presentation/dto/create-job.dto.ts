import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsArray,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** How often the salary figures are paid. See SalaryPeriodDto usage below. */
export enum SalaryPeriodDto {
  HOURLY = 'HOURLY',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  ANNUAL = 'ANNUAL',
}

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

  /**
   * ISO 4217 code. Defaults to USD server-side.
   *
   * Not defaulted HERE, so an employer who omits it is recorded as having omitted it
   * rather than as having chosen dollars — the column default is the single place that
   * decision is made.
   */
  @ApiPropertyOptional({ example: 'KHR', description: 'ISO 4217; defaults to USD' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  salaryCurrency?: string;

  /**
   * How often the amounts are paid. OMIT rather than guess: the amounts are stored as
   * plain integers, so 500 monthly and 500 annual are indistinguishable without this, and
   * a client that has to guess will guess wrong for most of the corpus
   * (MENTOR_REVIEW_2026-08-18 §12).
   */
  @ApiPropertyOptional({ enum: SalaryPeriodDto })
  @IsOptional()
  @IsEnum(SalaryPeriodDto)
  salaryPeriod?: SalaryPeriodDto;

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
