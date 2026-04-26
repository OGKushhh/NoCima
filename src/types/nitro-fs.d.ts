/**
 * Nitro FileSystem Type Definitions
 */

export interface FileStats {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  mtime: number;
  ctime: number;
}

export interface FileSystem {
  /**
   * Check if a file or directory exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Create a directory (with recursive option)
   */
  mkdir(path: string, recursive: boolean): Promise<void>;

  /**
   * Read directory contents
   */
  readdir(path: string): Promise<string[]>;

  /**
   * Get file/directory statistics
   */
  stat(path: string): Promise<FileStats>;

  /**
   * Open a file for reading or writing
   * modes: 'r' (read), 'w' (write), 'a' (append)
   */
  openFile(path: string, mode: 'r' | 'w' | 'a'): Promise<number>;

  /**
   * Write a chunk of data to an open file
   */
  writeChunk(handle: number, data: Uint8Array): Promise<void>;

  /**
   * Close an open file handle
   */
  closeFile(handle: number): Promise<void>;

  /**
   * Read entire file content
   */
  readFile(path: string, encoding: 'utf8' | 'base64'): Promise<string>;

  /**
   * Write entire file content
   */
  writeFile(path: string, content: string, encoding: 'utf8' | 'base64'): Promise<void>;

  /**
   * Delete a file
   */
  unlink(path: string): Promise<void>;

  /**
   * Rename/move a file
   */
  rename(oldPath: string, newPath: string): Promise<void>;

  /**
   * Get available storage space in bytes
   */
  getAvailableSpace(): Promise<number>;
}
