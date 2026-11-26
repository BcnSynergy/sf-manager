import type { Logger } from '@nestjs/common';
import type { FileStorage } from './ports/file-storage.port';

// A file younger than this may belong to a write in progress: every swept
// directory stores its file before the row that references it is written.
export const ORPHAN_FILE_MIN_AGE_MS = 60 * 60 * 1000;

// One directory the orphan file sweep cleans, and the rows that keep its
// files (EN-222, EN-244, EN-243).
export interface OrphanFileSweepTarget {
  directory: string;
  // What the files are, for the log lines ("review photo").
  fileLabel: string;
  // What references them, for the no-row warning ("photo").
  rowLabel: string;
  // The subset of `storageKeys` that some row references, whatever its age
  // or status.
  findReferencedStorageKeys(storageKeys: string[]): Promise<Set<string>>;
  // Whether any row that can reference a file of this directory exists.
  hasAnyRow(): Promise<boolean>;
}

// Deletes every file directly under `target.directory` that no row
// references and that was stored more than ORPHAN_FILE_MIN_AGE_MS before
// `now`. A referenced file is never touched. A file that cannot be deleted is
// logged and the others are still tried. When old files exist but no row at
// all, nothing is deleted (see below). It first deletes the leftovers of
// writes interrupted by a crash (EN-234), older than the same age; those are
// never a referenced file, so the no-row guard does not apply to them.
// Returns how many orphan files were deleted.
export async function sweepOrphanFiles(
  target: OrphanFileSweepTarget,
  fileStorage: FileStorage,
  now: Date,
  logger: Logger,
): Promise<number> {
  const cutoff = now.getTime() - ORPHAN_FILE_MIN_AGE_MS;
  await deleteUnfinishedWrites(target, fileStorage, new Date(cutoff), logger);

  const oldEnough = (await fileStorage.list(target.directory))
    .filter((file) => file.storedAt.getTime() < cutoff)
    .map((file) => file.key);
  if (oldEnough.length === 0) {
    logger.log(`Swept 0 orphan ${target.fileLabel} file(s)`);
    return 0;
  }
  // Old files but no row at all: the API is most likely running on a
  // database that does not match the files volume (an empty one after a
  // failed restore, a reset dev database). Deleting would wipe every file,
  // so nothing is deleted until a row exists.
  if (!(await target.hasAnyRow())) {
    logger.warn(
      `Skipped the orphan ${target.fileLabel} file sweep: ${oldEnough.length} old file(s) but no ${target.rowLabel} row at all ` +
        '(is the API on the database restored with these files?)',
    );
    return 0;
  }
  // Read after the listing: a row written meanwhile belongs to a file that
  // was already stored, so it is seen here and kept.
  const referenced = await target.findReferencedStorageKeys(oldEnough);

  let deleted = 0;
  for (const key of oldEnough) {
    if (referenced.has(key)) continue;
    try {
      await fileStorage.delete(key);
      deleted += 1;
    } catch (error) {
      logger.warn(
        `Could not delete orphan ${target.fileLabel} file ${key}: ${(error as Error).message}`,
      );
    }
  }
  logger.log(`Swept ${deleted} orphan ${target.fileLabel} file(s)`);
  return deleted;
}

// A failure here is logged and never stops the orphan file sweep.
async function deleteUnfinishedWrites(
  target: OrphanFileSweepTarget,
  fileStorage: FileStorage,
  startedBefore: Date,
  logger: Logger,
): Promise<void> {
  try {
    const deleted = await fileStorage.deleteUnfinishedWrites(
      target.directory,
      startedBefore,
    );
    logger.log(`Deleted ${deleted} unfinished ${target.fileLabel} write(s)`);
  } catch (error) {
    logger.warn(
      `Could not delete unfinished ${target.fileLabel} writes: ${(error as Error).message}`,
    );
  }
}
