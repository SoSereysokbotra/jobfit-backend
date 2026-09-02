import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CountryDto {
  @ApiProperty({ example: 'KH', description: 'ISO-3166 alpha-2.' })
  code!: string;

  @ApiProperty({ example: 'Cambodia' })
  name!: string;
}

export class CitySearchQueryDto {
  @ApiPropertyOptional({
    example: 'KH',
    description:
      'Restrict to one country (ISO-3166 alpha-2). Omit to search worldwide — the ' +
      'picker normally sends the country the user already chose.',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({
    example: 'phnom',
    description:
      'What the user has typed. Matched against display names, ASCII forms and every ' +
      'alternate name, so Khmer script and "PNH" both find Phnom Penh. Omit to get the ' +
      "country's largest cities.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CityDto {
  @ApiProperty({ example: 1821306, description: "GeoNames' id for this place." })
  geonameId!: number;

  @ApiProperty({ example: 'Phnom Penh' })
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Phnom Penh',
    description:
      'Province/state. NULL for city-states (Singapore), which genuinely have none — ' +
      'not a missing value to be filled in.',
  })
  admin1Name!: string | null;

  @ApiProperty({ example: 'KH' })
  countryCode!: string;

  @ApiProperty({ example: 'Cambodia' })
  countryName!: string;

  @ApiProperty({ example: 1573544, description: 'Used to order suggestions.' })
  population!: number;
}
