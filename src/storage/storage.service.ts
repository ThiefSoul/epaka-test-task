import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { FileStorageType } from '../files/persistance/file-storage-type.js';
import { isS3NotFoundError } from './s3-error.js';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly hotBucket: string;
  private readonly archiveBucket: string;

  constructor(config: ConfigService) {
    this.hotBucket = config.getOrThrow<string>('S3_HOT_BUCKET');
    this.archiveBucket = config.getOrThrow<string>('S3_ARCHIVE_BUCKET');
    this.client = new S3Client({
      region: config.getOrThrow<string>('AWS_REGION'),
      endpoint: config.getOrThrow<string>('AWS_ENDPOINT'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async put(
    storageType: FileStorageType,
    key: string,
    body: Buffer,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.getBucket(storageType),
        Key: key,
        Body: body,
      }),
    );
  }

  async get(storageType: FileStorageType, key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.getBucket(storageType),
        Key: key,
      }),
    );

    return Buffer.from(await result.Body!.transformToByteArray());
  }

  async delete(storageType: FileStorageType, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.getBucket(storageType),
        Key: key,
      }),
    );
  }

  async exists(storageType: FileStorageType, key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.getBucket(storageType),
          Key: key,
        }),
      );

      return true;
    } catch (error) {
      if (isS3NotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  private getBucket(storageType: FileStorageType): string {
    return storageType === FileStorageType.HOT
      ? this.hotBucket
      : this.archiveBucket;
  }
}
