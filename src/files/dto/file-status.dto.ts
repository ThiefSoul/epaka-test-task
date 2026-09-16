import { FileStorageType } from '../persistance/file-storage-type.js';

export type FileStatusDto = {
  id: string;
  exists: boolean;
  storageType: FileStorageType | null;
};
