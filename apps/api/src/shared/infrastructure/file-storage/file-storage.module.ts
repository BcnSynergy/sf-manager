import { Global, Module } from '@nestjs/common';
import { FILE_STORAGE } from '../../application/ports/file-storage.port';
import { getFileStorageDir } from '../env/file-storage-dir';
import { LocalFileStorage } from './local-file-storage';

// @Global() like IdGeneratorModule and ClockModule: any module can inject
// FILE_STORAGE. The directory is read at boot, so a production stack
// without FILE_STORAGE_DIR fails to start instead of failing on the first
// upload.
@Global()
@Module({
  providers: [
    {
      provide: FILE_STORAGE,
      useFactory: () => new LocalFileStorage(getFileStorageDir(process.env)),
    },
  ],
  exports: [FILE_STORAGE],
})
export class FileStorageModule {}
