import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CompanyService } from './company.service';
import { CompanyByNameQueryDto, CompanyIntelDto } from './dto/company-intel.dto';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
export class CompanyController {
  constructor(private readonly companies: CompanyService) {}

  @Get('by-name')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Company intelligence for the browser extension sidebar, by display name.',
  })
  @ApiResponse({ status: 200, type: CompanyIntelDto })
  @ApiResponse({ status: 204, description: 'Company not found in our database.' })
  async byName(
    @Query() query: CompanyByNameQueryDto,
  ): Promise<CompanyIntelDto | null> {
    return this.companies.getByName(query.name);
  }
}
