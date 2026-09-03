// Place lookup for the profile and onboarding pickers.
//
// WHY THESE EXIST: the onboarding wizard hardcoded seven US cities plus "Remote" in a
// REQUIRED field, so a user in Cambodia could not enter their own city at all — and the
// one value that was saved put a US state code ("CA") into the country column. Serving
// the list from the same table the scorer resolves against means the picker can only
// offer places that will actually resolve.
//
// Authenticated by the global JwtAuthGuard, like every route without @Public. No
// ThrottlerGuard: in this codebase that guard is reserved for the auth flows and the one
// public write (employer requests). These are authenticated reads of static reference
// data served from memory.

import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { LocationResolverService } from '../../location-resolver.service';
import { CityDto, CitySearchQueryDto, CountryDto } from '../dtos/location.dto';

@ApiTags('Locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationController {
  constructor(private readonly locations: LocationResolverService) {}

  @Get('countries')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Every country the place dataset covers, for the location picker.',
    description:
      'Derived from the `locations` table rather than a separate ISO list, so any ' +
      'country offered here is one whose cities can be resolved. Empty only when the ' +
      'table has not been imported.',
  })
  @ApiResponse({ status: 200, type: [CountryDto] })
  countries(): CountryDto[] {
    return this.locations.listCountries();
  }

  @Get('cities')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'City suggestions for a typeahead.',
    description:
      'Matches display names, ASCII forms and alternate names, so Khmer script and ' +
      '"PNH" both find Phnom Penh. Ordered by population. SUGGESTIONS ONLY — clients ' +
      'must still accept free text, since the dataset stops at 15,000 people and a ' +
      'smaller town must not be unenterable.',
  })
  @ApiResponse({ status: 200, type: [CityDto] })
  cities(@Query() query: CitySearchQueryDto): CityDto[] {
    return this.locations.searchCities({
      countryCode: query.country ?? null,
      query: query.q ?? null,
      limit: query.limit,
    });
  }
}
