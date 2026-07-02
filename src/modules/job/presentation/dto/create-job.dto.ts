import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, Min, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum RemoteTypeDto {
  REMOTE = 'REMOTE',
  HYBRID = 'HYBRID',
  ON_SITE = 'ON_SITE',
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
}
