import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../shared/presentation/decorators/public.decorator';
import {
  DEMO_LOGIN_ACCOUNTS,
  DEMO_PASSWORD,
  type DemoAccount,
} from '../demo-accounts';
import { DEMO_MODE } from '../demo-mode.token';

export type DemoInfo =
  | { enabled: false }
  | { enabled: true; password: string; accounts: readonly DemoAccount[] };

// demo-instance S6 (spec `deployment`, "Demo identification"). Like `health`,
// a single read with no domain behind it, so no application layer. Public:
// the login page reads it before anyone signs in. Outside the demo it says
// only that the demo is off.
@ApiTags('demo')
@Controller('demo')
export class DemoController {
  constructor(@Inject(DEMO_MODE) private readonly demoMode: boolean) {}

  @Public()
  @Get()
  @ApiOkResponse({
    description:
      'Whether this is the public demo and, if so, the demo accounts.',
  })
  info(): DemoInfo {
    if (!this.demoMode) return { enabled: false };
    return {
      enabled: true,
      password: DEMO_PASSWORD,
      accounts: DEMO_LOGIN_ACCOUNTS,
    };
  }
}
