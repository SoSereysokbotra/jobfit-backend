// src/modules/employer/presentation/controllers/employer-company.controller.ts
//
// Company Profile Management (Feature 1). All routes require an EMPLOYER JWT — enforced by
// the global JwtAuthGuard + RolesGuard via @Roles('EMPLOYER').

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { EmployerCompanyService } from '../../application/services/employer-company.service';
import { ClaimCompanyDto } from '../../application/dtos/claim-company.dto';
import { UpdateCompanyDto } from '../../application/dtos/update-company.dto';
import { EmployerCompanyResponseDto } from '../../application/dtos/company-response.dto';

@ApiTags('Employer - Company')
@ApiBearerAuth()
@Roles('EMPLOYER')
@Controller('employer/companies')
export class EmployerCompanyController {
  constructor(private readonly companyService: EmployerCompanyService) {}

  @Post('claim')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Claim an existing company' })
  @ApiResponse({ status: 404, description: 'Company not found.' })
  @ApiResponse({ status: 409, description: 'Already claimed.' })
  claim(
    @Body() dto: ClaimCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmployerCompanyResponseDto> {
    return this.companyService.claim(user.id, dto);
  }

  @Post(':id/verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify company ownership via email domain',
    description:
      "Marks the company verified if the employer's email domain matches the company " +
      'website domain.',
  })
  @ApiOkResponse({ type: EmployerCompanyResponseDto })
  @ApiResponse({ status: 400, description: 'Domain mismatch or no website.' })
  verifyEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmployerCompanyResponseDto> {
    return this.companyService.verifyEmail(user.id, user.email, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'View the company you manage' })
  @ApiOkResponse({ type: EmployerCompanyResponseDto })
  getCompany(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmployerCompanyResponseDto> {
    return this.companyService.getCompany(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update the company profile' })
  @ApiOkResponse({ type: EmployerCompanyResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmployerCompanyResponseDto> {
    return this.companyService.updateProfile(user.id, id, dto);
  }
}
