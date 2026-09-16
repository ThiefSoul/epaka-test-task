import { Logger } from '@nestjs/common';
import { In, type Repository } from 'typeorm';
import { StorageService } from '../../../storage/storage.service.js';
import { FileCacheService } from '../../file-cache.service.js';
import { FileMetadataEntity } from '../../persistance/file-metadata.entity.js';
import { FileStorageType } from '../../persistance/file-storage-type.js';
import { FilesService } from '../../files.service.js';

describe('FilesService status', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let repository: {
    save: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findOneBy: ReturnType<typeof vi.fn>;
  };
  let storage: {
    put: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let cache: {
    rememberFile: ReturnType<typeof vi.fn>;
    getFileStorageType: ReturnType<typeof vi.fn>;
    getFileStorageTypes: ReturnType<typeof vi.fn>;
  };
  let service: FilesService;

  beforeEach(() => {
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    repository = {
      save: vi.fn().mockResolvedValue({ id: 1 }),
      delete: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockResolvedValue([]),
      findOneBy: vi.fn().mockResolvedValue(null),
    };
    storage = {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(Buffer.from('test file')),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    cache = {
      rememberFile: vi.fn().mockResolvedValue(undefined),
      getFileStorageType: vi.fn().mockResolvedValue(null),
      getFileStorageTypes: vi.fn().mockResolvedValue(new Map()),
    };

    service = new FilesService(
      repository as unknown as Repository<FileMetadataEntity>,
      storage as unknown as StorageService,
      cache as unknown as FileCacheService,
    );
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns statuses from cache when available', async () => {
    cache.getFileStorageTypes.mockResolvedValue(
      new Map([
        ['123', FileStorageType.HOT],
        ['124', FileStorageType.ARCHIVE],
      ]),
    );

    await expect(
      service.getStatuses('invoice', ['123', '124']),
    ).resolves.toEqual({
      files: [
        { id: '123', exists: true, storageType: FileStorageType.HOT },
        { id: '124', exists: true, storageType: FileStorageType.ARCHIVE },
      ],
    });

    expect(repository.find).not.toHaveBeenCalled();
  });

  it('uses metadata for ids missing in cache', async () => {
    cache.getFileStorageTypes.mockResolvedValue(
      new Map([['123', FileStorageType.HOT]]),
    );
    repository.find.mockResolvedValue([
      { fileId: '124', storageType: FileStorageType.ARCHIVE },
    ]);

    await expect(
      service.getStatuses('invoice', ['123', '124', '999']),
    ).resolves.toEqual({
      files: [
        { id: '123', exists: true, storageType: FileStorageType.HOT },
        { id: '124', exists: true, storageType: FileStorageType.ARCHIVE },
        { id: '999', exists: false, storageType: null },
      ],
    });

    expect(repository.find).toHaveBeenCalledWith({
      where: {
        fileType: 'invoice',
        fileId: In(['124', '999']),
      },
      select: {
        fileId: true,
        storageType: true,
      },
    });
    expect(cache.rememberFile).toHaveBeenCalledWith(
      'invoice',
      '124',
      FileStorageType.ARCHIVE,
    );
  });

  it('falls back to metadata when cache read fails', async () => {
    cache.getFileStorageTypes.mockRejectedValue(new Error('redis failed'));
    repository.find.mockResolvedValue([
      { fileId: '123', storageType: FileStorageType.HOT },
    ]);

    await expect(service.getStatuses('invoice', ['123'])).resolves.toEqual({
      files: [{ id: '123', exists: true, storageType: FileStorageType.HOT }],
    });

    expect(warnSpy).toHaveBeenCalledWith(
      'Could not read file statuses for invoice from cache: redis failed',
    );
  });

  it('preserves first requested id order and skips duplicates', async () => {
    repository.find.mockResolvedValue([
      { fileId: '123', storageType: FileStorageType.HOT },
    ]);

    await expect(
      service.getStatuses('invoice', ['999', '123', '123']),
    ).resolves.toEqual({
      files: [
        { id: '999', exists: false, storageType: null },
        { id: '123', exists: true, storageType: FileStorageType.HOT },
      ],
    });
  });
});
