import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';

// Deliberately not split into full domain/application/infrastructure layers —
// this is a diagnostic endpoint proving the toolchain wiring works (the
// literal "walking skeleton"), not a business module. Real modules follow
// the full Clean Architecture layering per ADR-002.
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({ description: 'API and database are both reachable.' })
  @ApiServiceUnavailableResponse({
    description: 'The database is not reachable.',
  })
  async check(): Promise<{ status: 'ok'; db: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        db: 'unreachable',
      });
    }
    return { status: 'ok', db: 'ok' };
  }
}
