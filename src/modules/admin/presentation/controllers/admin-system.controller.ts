// src/modules/admin/presentation/controllers/admin-system.controller.ts
//
// System Health Monitoring & Alerting (Feature 1). All routes require an ADMIN JWT —
// enforced by the globally-registered JwtAuthGuard + RolesGuard via @Roles('ADMIN').

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SystemEventSeverity } from '@prisma/client';

import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { SystemHealthService } from '../../application/services/system-health.service';
import { MetricsQueryDto } from '../../application/dtos/metrics-query.dto';
import {
  AlertDto,
  SystemHealthDto,
  SystemMetricsDto,
} from '../../application/dtos/system-response.dto';

@ApiTags('Admin - System')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/system')
export class AdminSystemController {
  constructor(private readonly systemHealth: SystemHealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'Current platform health snapshot' })
  @ApiOkResponse({ type: SystemHealthDto })
  getHealth(): Promise<SystemHealthDto> {
    return this.systemHealth.getHealth();
  }

  @Get('metrics')
  @ApiOperation({
    summary: 'Metrics aggregated over a time window (1h | 24h | 7d)',
  })
  @ApiOkResponse({ type: SystemMetricsDto })
  getMetrics(@Query() query: MetricsQueryDto): Promise<SystemMetricsDto> {
    return this.systemHealth.getMetrics(query.period);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'List system alerts (newest first)' })
  @ApiOkResponse({ type: AlertDto, isArray: true })
  getAlerts(
    @Query('severity') severity?: SystemEventSeverity,
    @Query('acknowledged') acknowledged?: string,
    @Query('skip') skip = '0',
    @Query('take') take = '50',
  ): Promise<AlertDto[]> {
    return this.systemHealth.getAlerts({
      skip: toInt(skip, 0),
      take: Math.min(toInt(take, 50), 100),
      severity: parseSeverity(severity),
      acknowledged: parseBool(acknowledged),
    });
  }

  @Post('alerts/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acknowledge an alert' })
  @ApiOkResponse({ type: AlertDto })
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
  ): Promise<AlertDto> {
    return this.systemHealth.acknowledgeAlert(id, adminId);
  }
}

function toInt(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isNaN(n) || n < 0 ? fallback : n;
}

function parseBool(value?: string): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseSeverity(value?: string): SystemEventSeverity | undefined {
  return value && value in SystemEventSeverity
    ? (value as SystemEventSeverity)
    : undefined;
}
