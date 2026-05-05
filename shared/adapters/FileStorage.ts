/**
 * Abstract file storage. v1 implementation writes under
 * `app.getPath('userData')`. v2/v3 SaaS migration drops in S3 / cloud
 * storage with the same surface — locked decision §4.4.
 *
 * All paths are RELATIVE to the storage root (locked: never absolute).
 */
export interface FileStorage {
  write(relativePath: string, bytes: Uint8Array): Promise<void>;
  read(relativePath: string): Promise<Uint8Array>;
  exists(relativePath: string): Promise<boolean>;
  delete(relativePath: string): Promise<void>;
}
