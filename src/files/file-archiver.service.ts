import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { StorageService } from '../storage/storage.service.js';
import { FileCacheService } from './file-cache.service.js';
import { FileMetadataEntity } from './persistance/file-metadata.entity.js';
import { FileStorageType } from './persistance/file-storage-type.js';

@Injectable()
export class FileArchiverService {
  private readonly logger = new Logger(FileArchiverService.name);
  private readonly archiveAfterSeconds: number;
  private readonly batchSize: number;

  constructor(
    @InjectRepository(FileMetadataEntity)
    private readonly fileMetadataRepository: Repository<FileMetadataEntity>,
    private readonly storage: StorageService,
    private readonly cache: FileCacheService,
    config: ConfigService,
  ) {
    this.archiveAfterSeconds = config.getOrThrow<number>(
      'FILES_ARCHIVE_AFTER_SECONDS',
    );
    this.batchSize = config.getOrThrow<number>('FILES_ARCHIVE_BATCH_SIZE');
  }

  @Cron(CronExpression.EVERY_MINUTE, { waitForCompletion: true })
  async archiveEligibleFiles(): Promise<void> {
    const files = await this.findEligibleFiles();

    for (const file of files) {
      await this.archiveFile(file);
    }
  }

  private async findEligibleFiles(): Promise<FileMetadataEntity[]> {
    const archiveBefore = new Date(
      Date.now() - this.archiveAfterSeconds * 1000,
    );

    return this.fileMetadataRepository.find({
      where: {
        storageType: FileStorageType.HOT,
        createdAt: LessThanOrEqual(archiveBefore),
      },
      order: {
        createdAt: 'ASC',
      },
      take: this.batchSize,
    });
  }

  private async archiveFile(file: FileMetadataEntity): Promise<void> {
    const key = `${file.fileType}/${file.fileId}`;

    try {
      const body = await this.storage.get(FileStorageType.HOT, key);
      await this.storage.put(FileStorageType.ARCHIVE, key, body);

      if (!(await this.storage.exists(FileStorageType.ARCHIVE, key))) {
        throw new Error(`Archived file ${key} was not found after copy.`);
      }

      const updateResult = await this.fileMetadataRepository.update(
        { id: file.id, storageType: FileStorageType.HOT },
        { storageType: FileStorageType.ARCHIVE },
      );

      if (updateResult.affected !== 1) {
        throw new Error(`File ${key} is no longer eligible for archiving.`);
      }

      await this.storage.delete(FileStorageType.HOT, key);
      await this.forgetHotFile(file);
    } catch (error) {
      this.logger.warn(
        `Could not archive file ${key}: ${this.errorMessage(error)}`,
      );
    }
  }

  private async forgetHotFile(file: FileMetadataEntity): Promise<void> {
    try {
      await this.cache.forgetFile(file.fileType, file.fileId);
    } catch (error) {
      this.logger.warn(
        `Archived file ${file.fileType}/${file.fileId}, but cache cleanup failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
