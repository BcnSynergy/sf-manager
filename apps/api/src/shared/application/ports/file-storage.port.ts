// Port (application layer, ADR-002/013): stores binary files by an opaque
// key such as `logos/<uuidv7>.png`. Callers never see a filesystem path, so
// the local-volume adapter (LocalFileStorage) can later be swapped for
// object storage without touching the domain (ADR-012 addendum,
// organization-logo S3).
export type StoredFile = {
  key: string;
  // When the content was last stored (a file's modification time).
  storedAt: Date;
};

export interface FileStorage {
  // Stores the content under the key, replacing any previous content.
  put(key: string, content: Buffer): Promise<void>;

  // Resolves null when nothing is stored under the key.
  get(key: string): Promise<Buffer | null>;

  // Removing a key that does not exist succeeds.
  delete(key: string): Promise<void>;

  // The keys stored directly under one directory segment (for example
  // `review-photos`), in no particular order; nothing when it does not
  // exist. Only complete files are listed, never one still being written.
  // EN-222: used by the orphan photo file sweep.
  list(directory: string): Promise<StoredFile[]>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
