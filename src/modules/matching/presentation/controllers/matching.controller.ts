import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RecommendationsQueryService } from '../../application/services/recommendations-query.service';
import { RecommendedJobDto } from '../dtos/recommended-job.dto';

@ApiTags('Matching')
@ApiBearerAuth()
@Controller('recommendations')
export class MatchingController {
  constructor(private readonly recommendations: RecommendationsQueryService) {}

  @Get()
  @ApiOperation({
    summary:
      'Personalized job recommendations for the current user (semantic match). ' +
      'Computed lazily on first request if not yet cached.',
  })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<RecommendedJobDto[]> {
    return this.recommendations.getForUser(user.id);
  }
}
