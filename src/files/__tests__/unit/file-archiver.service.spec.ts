import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LessThanOrEqual, type Repository } from 'typeorm';
import { StorageService } from '../../../storage/storage.service.js';
import { FileArchiverService } from '../../file-archiver.service.js';
import { FileCacheService } from '../../file-cache.service.js';
import { FileMetadataEntity } from '../../persistance/file-metadata.entity.js';
import { FileStorageType } from '../../persistance/file-storage-type.js';

describe('FileArchiverService', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let repository: {
    find: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let storage: {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let cache: {
    forgetFile: ReturnType<typeof vi.fn>;
  };
  let service: FileArchiverService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T12:00:00.000Z'));
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    repository = {
      find: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    storage = {
      get: vi.fn().mockResolvedValue(Buffer.from('test file')),
      put: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    cache = {
      forgetFile: vi.fn().mockResolvedValue(undefined),
    };

    service = new FileArchiverService(
      repository as unknown as Repository<FileMetadataEntity>,
      storage as unknown as StorageService,
      cache as unknown as FileCacheService,
      {
        getOrThrow: vi.fn((key: string) => {
          const config = {
            FILES_ARCHIVE_AFTER_SECONDS: 60,
            FILES_ARCHIVE_BATCH_SIZE: 10,
          };

          return config[key as keyof typeof config];
        }),
      } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    warnSpy.mockRestore();
  });

  it('selects old hot files in batches', async () => {
    await service.archiveEligibleFiles();

    expect(repository.find).toHaveBeenCalledWith({
      where: {
        storageType: FileStorageType.HOT,
        createdAt: LessThanOrEqual(new Date('2026-09-16T11:59:00.000Z')),
      },
      order: {
        createdAt: 'ASC',
      },
      take: 10,
    });
  });

  it('archives an eligible hot file', async () => {
    const file = fileMetadata();
    const body = Buffer.from('archivable file');
    repository.find.mockResolvedValue([file]);
    storage.get.mockResolvedValue(body);

    await service.archiveEligibleFiles();

    expect(storage.get).toHaveBeenCalledWith(FileStorageType.HOT, 'invoice/123');
    expect(storage.put).toHaveBeenCalledWith(
      FileStorageType.ARCHIVE,
      'invoice/123',
      body,
    );
    expect(storage.exists).toHaveBeenCalledWith(
      FileStorageType.ARCHIVE,
      'invoice/123',
    );
    expect(repository.update).toHaveBeenCalledWith(
      { id: 1, storageType: FileStorageType.HOT },
      { storageType: FileStorageType.ARCHIVE },
    );
    expect(cache.forgetFile).toHaveBeenCalledWith('invoice', '123');
    expect(cache.forgetFile.mock.invocationCallOrder[0]).toBeLessThan(
      repository.update.mock.invocationCallOrder[0],
    );
    expect(storage.delete).toHaveBeenCalledWith(
      FileStorageType.HOT,
      'invoice/123',
    );
  });

  it('does not delete hot source when archive verification fails', async () => {
    repository.find.mockResolvedValue([fileMetadata()]);
    storage.exists.mockResolvedValue(false);

    await service.archiveEligibleFiles();

    expect(repository.update).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(cache.forgetFile).not.toHaveBeenCalled();
  });

  it('does not delete hot source when metadata update fails', async () => {
    repository.find.mockResolvedValue([fileMetadata()]);
    repository.update.mockRejectedValue(new Error('database failed'));

    await service.archiveEligibleFiles();

    expect(storage.delete).not.toHaveBeenCalled();
    expect(cache.forgetFile).toHaveBeenCalledWith('invoice', '123');
  });

  it('does not fail the batch when one file fails', async () => {
    repository.find.mockResolvedValue([
      fileMetadata({ id: 1, fileId: 'first' }),
      fileMetadata({ id: 2, fileId: 'second' }),
    ]);
    storage.get.mockRejectedValueOnce(new Error('storage failed'));

    await service.archiveEligibleFiles();

    expect(storage.put).toHaveBeenCalledWith(
      FileStorageType.ARCHIVE,
      'invoice/second',
      Buffer.from('test file'),
    );
    expect(repository.update).toHaveBeenCalledWith(
      { id: 2, storageType: FileStorageType.HOT },
      { storageType: FileStorageType.ARCHIVE },
    );
  });

  it('does not update metadata or delete hot source when cache cleanup fails', async () => {
    repository.find.mockResolvedValue([fileMetadata()]);
    cache.forgetFile.mockRejectedValue(new Error('redis failed'));

    await service.archiveEligibleFiles();

    expect(repository.update).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'Could not archive file invoice/123: redis failed',
    );
  });

});

function fileMetadata(
  overrides: Partial<FileMetadataEntity> = {},
): FileMetadataEntity {
  return {
    id: 1,
    fileType: 'invoice',
    fileId: '123',
    storageType: FileStorageType.HOT,
    createdAt: new Date('2026-09-16T11:58:00.000Z'),
    ...overrides,
  };
}
