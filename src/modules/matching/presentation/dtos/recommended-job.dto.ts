import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class SalaryRangeDto {
  @ApiProperty() min: number;
  @ApiProperty() max: number;
  @ApiProperty() currency: string;
}

/**
 * A recommended job. Mirrors the job feature's JobDto (so the frontend can reuse
 * its `toJobView` mapper) and adds the match score + explanation.
 */
export class RecommendedJobDto {
  @ApiProperty() id: string;
  @ApiProperty() companyId: string;
  @ApiPropertyOptional() companyName?: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() status: string;
  @ApiProperty() remoteType: string;
  @ApiPropertyOptional() location?: string;
  @ApiPropertyOptional({ type: SalaryRangeDto }) salaryRange?: SalaryRangeDto;
  @ApiProperty({ type: [String] }) skillIds: string[];
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;

  @ApiProperty({ description: 'Weighted match score, 0-100.' })
  match: number;
  @ApiPropertyOptional({ description: 'Human-readable "why this matched".' })
  reason?: string;
  @ApiPropertyOptional({ description: 'Sub-scores: skills/experience/location/salary/other.' })
  breakdown?: Record<string, number>;
}
