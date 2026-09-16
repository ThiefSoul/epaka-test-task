import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { isPostgresUniqueViolation } from '../database/database-error.js';
import { isS3NotFoundError } from '../storage/s3-error.js';
import { StorageService } from '../storage/storage.service.js';
import { type FileIdsResponseDto } from './dto/file-ids-response.dto.js';
import { type FileStatusDto } from './dto/file-status.dto.js';
import { type FileStatusesResponseDto } from './dto/file-statuses-response.dto.js';
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
    try {
      await this.fileMetadataRepository.insert({
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
      await this.fileMetadataRepository.delete({ fileType, fileId });
      throw error;
    }

    try {
      await this.cache.rememberHotFile(fileType, fileId);
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

  async listIds(fileType: string): Promise<FileIdsResponseDto> {
    const metadata = await this.fileMetadataRepository.find({
      where: { fileType },
      order: { fileId: 'ASC' },
      select: { fileId: true },
    });

    return {
      ids: metadata.map(({ fileId }) => fileId),
    };
  }

  async getStatuses(
    fileType: string,
    fileIds: string[],
  ): Promise<FileStatusesResponseDto> {
    const uniqueFileIds = [...new Set(fileIds)];
    const hotFileIds = await this.getCachedHotFileIds(
      fileType,
      uniqueFileIds,
    );
    const missingIds = uniqueFileIds.filter(
      (fileId) => !hotFileIds.has(fileId),
    );
    const storageTypes = await this.getMetadataStorageTypes(
      fileType,
      missingIds,
    );

    for (const fileId of hotFileIds) {
      storageTypes.set(fileId, FileStorageType.HOT);
    }

    const files = uniqueFileIds.map((fileId) =>
      this.fileStatus(fileId, storageTypes.get(fileId) ?? null),
    );

    return { files };
  }

  async delete(fileType: string, fileId: string): Promise<void> {
    const metadata = await this.fileMetadataRepository.findOneBy({
      fileType,
      fileId,
    });

    if (!metadata) {
      throw new NotFoundException('File not found.');
    }

    await this.storage.delete(
      metadata.storageType,
      this.storageKey(fileType, fileId),
    );
    await this.fileMetadataRepository.delete(metadata.id);

    try {
      await this.cache.forgetFile(fileType, fileId);
    } catch (error) {
      this.logger.warn(
        `Deleted file ${fileType}/${fileId}, but cache cleanup failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private async resolveStorageType(
    fileType: string,
    fileId: string,
  ): Promise<FileStorageType> {
    try {
      const isHot = await this.cache.hasHotFile(fileType, fileId);

      if (isHot) {
        return FileStorageType.HOT;
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

    await this.rememberHotMetadata(fileType, [metadata]);

    return metadata.storageType;
  }

  private async getCachedHotFileIds(
    fileType: string,
    fileIds: string[],
  ): Promise<Set<string>> {
    try {
      return await this.cache.getHotFileIds(fileType, fileIds);
    } catch (error) {
      this.logger.warn(
        `Could not read file statuses for ${fileType} from cache: ${this.errorMessage(error)}`,
      );

      return new Set();
    }
  }

  private async getMetadataStorageTypes(
    fileType: string,
    fileIds: string[],
  ): Promise<Map<string, FileStorageType>> {
    if (fileIds.length === 0) {
      return new Map();
    }

    const metadata = await this.fileMetadataRepository.find({
      where: {
        fileType,
        fileId: In(fileIds),
      },
      select: {
        fileId: true,
        storageType: true,
      },
    });

    await this.rememberHotMetadata(fileType, metadata);

    return new Map(
      metadata.map(({ fileId, storageType }) => [fileId, storageType]),
    );
  }

  private async rememberHotMetadata(
    fileType: string,
    metadata: Pick<FileMetadataEntity, 'fileId' | 'storageType'>[],
  ): Promise<void> {
    const hotFileIds = metadata
      .filter(({ storageType }) => storageType === FileStorageType.HOT)
      .map(({ fileId }) => fileId);

    try {
      await this.cache.rememberHotFiles(fileType, hotFileIds);
    } catch (error) {
      this.logger.warn(
        `Found hot files for ${fileType}, but cache update failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private storageKey(fileType: string, fileId: string): string {
    return `${fileType}/${fileId}`;
  }

  private fileStatus(
    fileId: string,
    storageType: FileStorageType | null,
  ): FileStatusDto {
    return {
      id: fileId,
      exists: storageType !== null,
      storageType,
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
