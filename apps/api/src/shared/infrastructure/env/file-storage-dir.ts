import { resolve } from 'node:path';
import { isProduction } from './is-production';

// organization-logo S3: uploaded files live in FILE_STORAGE_DIR (a Docker
// volume in production). Outside production it defaults to ./storage under
// the API's working directory; production must set it, so files never land
// in a directory that disappears with the container.
export function getFileStorageDir(env: NodeJS.ProcessEnv): string {
  const raw = env.FILE_STORAGE_DIR;
  if (raw === undefined || raw === '') {
    if (isProduction(env.NODE_ENV)) {
      throw new Error('FILE_STORAGE_DIR must be set in production');
    }
    return resolve('storage');
  }
  return resolve(raw);
}
