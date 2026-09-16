import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

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

  async rememberHotFile(fileType: string, fileId: string): Promise<void> {
    await this.rememberHotFiles(fileType, [fileId]);
  }

  async rememberHotFiles(fileType: string, fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) {
      return;
    }

    await this.client.sAdd(this.hotFilesKey(fileType), fileIds);
  }

  async hasHotFile(fileType: string, fileId: string): Promise<boolean> {
    return (
      (await this.client.sIsMember(this.hotFilesKey(fileType), fileId)) === 1
    );
  }

  async getHotFileIds(
    fileType: string,
    fileIds: string[],
  ): Promise<Set<string>> {
    if (fileIds.length === 0) {
      return new Set();
    }

    const exists = await this.client.smIsMember(
      this.hotFilesKey(fileType),
      fileIds,
    );
    const result = new Set<string>();

    exists.forEach((isHot, index) => {
      if (isHot) {
        result.add(fileIds[index]);
      }
    });

    return result;
  }

  async forgetFile(fileType: string, fileId: string): Promise<void> {
    await this.client.sRem(this.hotFilesKey(fileType), fileId);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  private hotFilesKey(fileType: string): string {
    return `hot-files:${fileType}`;
  }
}
