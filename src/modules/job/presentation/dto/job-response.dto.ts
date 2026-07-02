import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SalaryRangeResponseDto {
  @ApiProperty() min: number;
  @ApiProperty() max: number;
  @ApiProperty() currency: string;
}

export class JobResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() companyId: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() status: string;
  @ApiProperty() remoteType: string;
  @ApiPropertyOptional() location?: string;
  @ApiPropertyOptional() salaryRange?: SalaryRangeResponseDto;
  @ApiProperty({ type: [String] }) skillIds: string[];
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}
