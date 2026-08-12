import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SalaryService } from './salary.service';
import { SalaryIntelDto, SalaryQueryDto } from './dto/salary.dto';

@ApiTags('Salary')
@ApiBearerAuth()
@Controller('salary')
export class SalaryController {
  constructor(private readonly salary: SalaryService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Market salary for a company + role (extension salary panel).',
  })
  @ApiResponse({ status: 200, type: SalaryIntelDto })
  @ApiResponse({ status: 200, description: 'null data when no salary postings exist.' })
  async byCompanyRole(@Query() query: SalaryQueryDto): Promise<SalaryIntelDto | null> {
    return this.salary.getSalary(query.company, query.role);
  }
}
