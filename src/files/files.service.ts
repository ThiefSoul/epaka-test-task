import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isPostgresUniqueViolation } from '../database/database-error.js';
import { StorageService } from '../storage/storage.service.js';
import { FileCacheService } from './file-cache.service.js';
import { FileMetadataEntity } from './persistance/file-metadata.entity.js';
import { FileStorageType } from './persistance/file-storage-type.js';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectRepository(FileMetadataEntity)
    private readonly fileMetadataRepository: Repository<FileMetadataEntity>,
    private readonly storage: StorageService,
    private readonly cache: FileCacheService,
  ) {}

  async upload(fileType: string, fileId: string, body: Buffer): Promise<void> {
    let metadata: FileMetadataEntity;

    try {
      metadata = await this.fileMetadataRepository.save({
        fileType,
        fileId,
        storageType: FileStorageType.HOT,
      });
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException('File already exists.');
      }

      throw error;
    }

    const key = this.storageKey(fileType, fileId);

    try {
      await this.storage.put(FileStorageType.HOT, key, body);
    } catch (error) {
      await this.fileMetadataRepository.delete(metadata.id);
      throw error;
    }

    try {
      await this.cache.rememberFile(fileType, fileId, FileStorageType.HOT);
    } catch (error) {
      this.logger.warn(
        `Uploaded file ${fileType}/${fileId}, but cache update failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private storageKey(fileType: string, fileId: string): string {
    return `${fileType}/${fileId}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
