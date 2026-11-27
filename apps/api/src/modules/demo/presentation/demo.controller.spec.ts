import { Test } from '@nestjs/testing';
import { DEMO_MODE } from '../demo-mode.token';
import { DemoController } from './demo.controller';

async function controllerWith(demoMode: boolean): Promise<DemoController> {
  const module = await Test.createTestingModule({
    controllers: [DemoController],
    providers: [{ provide: DEMO_MODE, useValue: demoMode }],
  }).compile();
  return module.get(DemoController);
}

// demo-instance S6 (spec `deployment`, "Demo identification").
describe('DemoController', () => {
  it('answers only that the demo is off outside the demo', async () => {
    const controller = await controllerWith(false);

    expect(controller.info()).toEqual({ enabled: false });
  });

  it('answers the shared password and one account per role on the demo', async () => {
    const controller = await controllerWith(true);

    expect(controller.info()).toEqual({
      enabled: true,
      password: 'sf-manager-demo-1',
      accounts: [
        { email: 'gestor@demo.sf-manager.example', role: 'MANAGER' },
        {
          email: 'empresa1@demo.sf-manager.example',
          role: 'MAINTENANCE_COMPANY_MANAGER',
        },
        {
          email: 'tecnico1a@demo.sf-manager.example',
          role: 'MAINTENANCE_TECHNICIAN',
        },
        {
          email: 'presidente1@demo.sf-manager.example',
          role: 'COMMUNITY_REPRESENTATIVE',
        },
      ],
    });
  });
});
