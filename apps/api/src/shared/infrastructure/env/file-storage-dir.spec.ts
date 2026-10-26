import { resolve } from 'node:path';
import { getFileStorageDir } from './file-storage-dir';

describe('getFileStorageDir', () => {
  it('resolves FILE_STORAGE_DIR when set', () => {
    expect(
      getFileStorageDir({
        NODE_ENV: 'production',
        FILE_STORAGE_DIR: '/data/files',
      }),
    ).toBe(resolve('/data/files'));
  });

  it.each([undefined, ''])(
    'defaults to ./storage outside production when FILE_STORAGE_DIR is %j',
    (value) => {
      expect(
        getFileStorageDir({ NODE_ENV: 'development', FILE_STORAGE_DIR: value }),
      ).toBe(resolve('storage'));
    },
  );

  it.each([undefined, ''])(
    'throws in production when FILE_STORAGE_DIR is %j',
    (value) => {
      expect(() =>
        getFileStorageDir({ NODE_ENV: 'production', FILE_STORAGE_DIR: value }),
      ).toThrow('FILE_STORAGE_DIR must be set in production');
    },
  );
});
