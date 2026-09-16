import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isPostgresUniqueViolation } from '../database/database-error.js';
import { isS3NotFoundError } from '../storage/s3-error.js';
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

  async download(fileType: string, fileId: string): Promise<Buffer> {
    const storageType = await this.resolveStorageType(fileType, fileId);

    try {
      return await this.storage.get(
        storageType,
        this.storageKey(fileType, fileId),
      );
    } catch (error) {
      if (isS3NotFoundError(error)) {
        throw new NotFoundException('File not found.');
      }

      throw error;
    }
  }

  private async resolveStorageType(
    fileType: string,
    fileId: string,
  ): Promise<FileStorageType> {
    try {
      const cachedStorageType = await this.cache.getFileStorageType(
        fileType,
        fileId,
      );

      if (cachedStorageType) {
        return cachedStorageType;
      }
    } catch (error) {
      this.logger.warn(
        `Could not read file ${fileType}/${fileId} from cache: ${this.errorMessage(error)}`,
      );
    }

    const metadata = await this.fileMetadataRepository.findOneBy({
      fileType,
      fileId,
    });

    if (!metadata) {
      throw new NotFoundException('File not found.');
    }

    try {
      await this.cache.rememberFile(fileType, fileId, metadata.storageType);
    } catch (error) {
      this.logger.warn(
        `Found file ${fileType}/${fileId}, but cache update failed: ${this.errorMessage(error)}`,
      );
    }

    return metadata.storageType;
  }

  private storageKey(fileType: string, fileId: string): string {
    return `${fileType}/${fileId}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
