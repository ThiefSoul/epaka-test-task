import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { FileStorageType } from './persistance/file-storage-type.js';

type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class FileCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly client: RedisClient;

  constructor(config: ConfigService) {
    this.client = createClient({
      database: config.getOrThrow<number>('REDIS_DB'),
      socket: {
        host: config.getOrThrow<string>('REDIS_HOST'),
        port: config.getOrThrow<number>('REDIS_PORT'),
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async rememberFile(
    fileType: string,
    fileId: string,
    storageType: FileStorageType,
  ): Promise<void> {
    await this.client
      .multi()
      .sAdd(this.fileTypeIdsKey(fileType), fileId)
      .set(this.fileStorageTypeKey(fileType, fileId), storageType)
      .exec();
  }

  async getFileStorageType(
    fileType: string,
    fileId: string,
  ): Promise<FileStorageType | null> {
    const storageType = await this.client.get(
      this.fileStorageTypeKey(fileType, fileId),
    );

    return this.parseStorageType(storageType);
  }

  async getFileStorageTypes(
    fileType: string,
    fileIds: string[],
  ): Promise<Map<string, FileStorageType>> {
    const storageTypes = await this.client.mGet(
      fileIds.map((fileId) => this.fileStorageTypeKey(fileType, fileId)),
    );
    const result = new Map<string, FileStorageType>();

    storageTypes.forEach((storageType, index) => {
      const parsedStorageType = this.parseStorageType(storageType);

      if (parsedStorageType) {
        result.set(fileIds[index], parsedStorageType);
      }
    });

    return result;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  private fileTypeIdsKey(fileType: string): string {
    return `files:${fileType}:ids`;
  }

  private fileStorageTypeKey(fileType: string, fileId: string): string {
    return `files:${fileType}:${fileId}:storage-type`;
  }

  private parseStorageType(storageType: string | null): FileStorageType | null {
    return Object.values(FileStorageType).includes(
      storageType as FileStorageType,
    )
      ? (storageType as FileStorageType)
      : null;
  }
}
