import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SalaryRangeResponseDto {
  @ApiProperty() min: number;
  @ApiProperty() max: number;
  @ApiProperty() currency: string;
}

export class JobResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() companyId: string;
  @ApiPropertyOptional({
    description:
      'Display name of the posting company. Enriched by JobService from the ' +
      'Company table; absent if the company row is missing.',
  })
  companyName?: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() status: string;
  @ApiProperty() remoteType: string;
  @ApiPropertyOptional() location?: string;
  @ApiPropertyOptional() salaryRange?: SalaryRangeResponseDto;
  @ApiProperty({ type: [String] }) skillIds: string[];
  @ApiProperty({ type: [String] }) responsibilities: string[];
  @ApiProperty({ type: [String] }) requirements: string[];
  @ApiProperty({ type: [String] }) benefits: string[];
  @ApiPropertyOptional({ type: Number, nullable: true }) bonusPct?: number | null;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}
