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
}
