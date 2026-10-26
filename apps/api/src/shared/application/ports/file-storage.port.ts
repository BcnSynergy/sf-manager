// Port (application layer, ADR-002/013): stores binary files by an opaque
// key such as `logos/<uuidv7>.png`. Callers never see a filesystem path, so
// the local-volume adapter (LocalFileStorage) can later be swapped for
// object storage without touching the domain (ADR-012 addendum,
// organization-logo S3).
export interface FileStorage {
  // Stores the content under the key, replacing any previous content.
  put(key: string, content: Buffer): Promise<void>;

  // Resolves null when nothing is stored under the key.
  get(key: string): Promise<Buffer | null>;

  // Removing a key that does not exist succeeds.
  delete(key: string): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
