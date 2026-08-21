import { Global, Module } from '@nestjs/common';
import { ID_GENERATOR } from '../../application/ports/id-generator.port';
import { UuidV7IdGenerator } from './uuid-v7.id-generator';

@Global()
@Module({
  providers: [{ provide: ID_GENERATOR, useClass: UuidV7IdGenerator }],
  exports: [ID_GENERATOR],
})
export class IdGeneratorModule {}
