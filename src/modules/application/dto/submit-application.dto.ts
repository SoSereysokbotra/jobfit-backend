import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitApplicationDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  jobId: string;

  /**
   * The CV you are applying with. Must be one of YOUR résumés — an id you do not own is
   * refused, not silently ignored.
   *
   * Optional, but not free-floating: omit it and the server records your default résumé
   * instead of nothing, because this column is what the employer's screening reads. It
   * is resolved once at submission and never re-resolved, so changing your default
   * afterwards does not rewrite an application an employer may already have acted on.
   */
  @ApiPropertyOptional({
    description:
      'A résumé you own. Defaults to your active résumé. Fixed at submission — the ' +
      'employer’s screening is computed against this document.',
  })
  @IsOptional()
  @IsString()
  resumeId?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  coverLetter?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
