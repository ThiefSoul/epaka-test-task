import { Logger, NotFoundException } from '@nestjs/common';
import { type Repository } from 'typeorm';
import { StorageService } from '../../../storage/storage.service.js';
import { FileCacheService } from '../../file-cache.service.js';
import { FileMetadataEntity } from '../../persistance/file-metadata.entity.js';
import { FileStorageType } from '../../persistance/file-storage-type.js';
import { FilesService } from '../../files.service.js';

describe('FilesService download', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let repository: {
    save: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    findOneBy: ReturnType<typeof vi.fn>;
  };
  let storage: {
    put: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let cache: {
    rememberHotFile: ReturnType<typeof vi.fn>;
    rememberHotFiles: ReturnType<typeof vi.fn>;
    hasHotFile: ReturnType<typeof vi.fn>;
  };
  let service: FilesService;

  beforeEach(() => {
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    repository = {
      save: vi.fn().mockResolvedValue({ id: 1 }),
      delete: vi.fn().mockResolvedValue({}),
      findOneBy: vi.fn().mockResolvedValue(null),
    };
    storage = {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(Buffer.from('test file')),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    cache = {
      rememberHotFile: vi.fn().mockResolvedValue(undefined),
      rememberHotFiles: vi.fn().mockResolvedValue(undefined),
      hasHotFile: vi.fn().mockResolvedValue(false),
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

  it('downloads hot file from cache hit', async () => {
    const body = Buffer.from('cached file');
    cache.hasHotFile.mockResolvedValue(true);
    storage.get.mockResolvedValue(body);

    await expect(service.download('invoice', '123')).resolves.toEqual(body);

    expect(repository.findOneBy).not.toHaveBeenCalled();
    expect(storage.get).toHaveBeenCalledWith(
      FileStorageType.HOT,
      'invoice/123',
    );
  });

  it('downloads file using metadata when cache has no entry', async () => {
    const body = Buffer.from('database file');
    repository.findOneBy.mockResolvedValue({
      fileType: 'invoice',
      fileId: '123',
      storageType: FileStorageType.HOT,
    });
    storage.get.mockResolvedValue(body);

    await expect(service.download('invoice', '123')).resolves.toEqual(body);

    expect(storage.get).toHaveBeenCalledWith(
      FileStorageType.HOT,
      'invoice/123',
    );
    expect(cache.rememberHotFiles).toHaveBeenCalledWith('invoice', ['123']);
  });

  it('downloads archive file using metadata without caching it', async () => {
    const body = Buffer.from('archive file');
    repository.findOneBy.mockResolvedValue({
      fileType: 'invoice',
      fileId: '123',
      storageType: FileStorageType.ARCHIVE,
    });
    storage.get.mockResolvedValue(body);

    await expect(service.download('invoice', '123')).resolves.toEqual(body);

    expect(storage.get).toHaveBeenCalledWith(
      FileStorageType.ARCHIVE,
      'invoice/123',
    );
    expect(cache.rememberHotFile).not.toHaveBeenCalled();
  });

  it('downloads file using metadata when cache read fails', async () => {
    cache.hasHotFile.mockRejectedValue(new Error('redis failed'));
    repository.findOneBy.mockResolvedValue({
      fileType: 'invoice',
      fileId: '123',
      storageType: FileStorageType.HOT,
    });

    await expect(service.download('invoice', '123')).resolves.toEqual(
      Buffer.from('test file'),
    );

    expect(storage.get).toHaveBeenCalledWith(
      FileStorageType.HOT,
      'invoice/123',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Could not read file invoice/123 from cache: redis failed',
    );
  });

  it('throws not found when metadata is missing', async () => {
    await expect(service.download('invoice', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(storage.get).not.toHaveBeenCalled();
  });

  it('throws not found when object is missing in storage', async () => {
    repository.findOneBy.mockResolvedValue({
      fileType: 'invoice',
      fileId: '123',
      storageType: FileStorageType.HOT,
    });
    storage.get.mockRejectedValue({
      $metadata: {
        httpStatusCode: 404,
      },
    });

    await expect(service.download('invoice', '123')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
