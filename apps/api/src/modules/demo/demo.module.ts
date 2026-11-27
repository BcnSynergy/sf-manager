import { Module } from '@nestjs/common';
import { isDemoMode } from '../../shared/infrastructure/env/demo-mode';
import { DEMO_MODE } from './demo-mode.token';
import { DemoController } from './presentation/demo.controller';

// DEMO_MODE is read when the app boots, so a bad value stops it there.
@Module({
  controllers: [DemoController],
  providers: [
    { provide: DEMO_MODE, useFactory: () => isDemoMode(process.env) },
  ],
})
export class DemoModule {}
