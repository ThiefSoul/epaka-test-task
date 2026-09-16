import { Logger, NotFoundException } from '@nestjs/common';
import { type Repository } from 'typeorm';
import { StorageService } from '../../../storage/storage.service.js';
import { FileCacheService } from '../../file-cache.service.js';
import { FileMetadataEntity } from '../../persistance/file-metadata.entity.js';
import { FileStorageType } from '../../persistance/file-storage-type.js';
import { FilesService } from '../../files.service.js';

describe('FilesService delete', () => {
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
    hasHotFile: ReturnType<typeof vi.fn>;
    forgetFile: ReturnType<typeof vi.fn>;
  };
  let service: FilesService;

  beforeEach(() => {
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    repository = {
      save: vi.fn().mockResolvedValue({ id: 1 }),
      delete: vi.fn().mockResolvedValue({}),
      findOneBy: vi.fn().mockResolvedValue({
        id: 1,
        fileType: 'invoice',
        fileId: '123',
        storageType: FileStorageType.HOT,
      }),
    };
    storage = {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(Buffer.from('test file')),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    cache = {
      rememberHotFile: vi.fn().mockResolvedValue(undefined),
      hasHotFile: vi.fn().mockResolvedValue(false),
      forgetFile: vi.fn().mockResolvedValue(undefined),
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

  it('deletes file from its storage', async () => {
    await service.delete('invoice', '123');

    expect(storage.delete).toHaveBeenCalledWith(
      FileStorageType.HOT,
      'invoice/123',
    );
  });

  it('deletes metadata after storage', async () => {
    await service.delete('invoice', '123');

    expect(repository.delete).toHaveBeenCalledWith(1);
    expect(storage.delete.mock.invocationCallOrder[0]).toBeLessThan(
      repository.delete.mock.invocationCallOrder[0],
    );
  });

  it('removes file from cache after delete', async () => {
    await service.delete('invoice', '123');

    expect(cache.forgetFile).toHaveBeenCalledWith('invoice', '123');
  });

  it('uses archive storage when metadata points to archive', async () => {
    repository.findOneBy.mockResolvedValue({
      id: 1,
      fileType: 'invoice',
      fileId: '123',
      storageType: FileStorageType.ARCHIVE,
    });

    await service.delete('invoice', '123');

    expect(storage.delete).toHaveBeenCalledWith(
      FileStorageType.ARCHIVE,
      'invoice/123',
    );
  });

  it('throws not found when metadata is missing', async () => {
    repository.findOneBy.mockResolvedValue(null);

    await expect(service.delete('invoice', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(storage.delete).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
    expect(cache.forgetFile).not.toHaveBeenCalled();
  });

  it('does not fail delete when cache cleanup fails', async () => {
    cache.forgetFile.mockRejectedValue(new Error('redis failed'));

    await expect(service.delete('invoice', '123')).resolves.toBeUndefined();

    expect(repository.delete).toHaveBeenCalledWith(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Deleted file invoice/123, but cache cleanup failed: redis failed',
    );
  });
});
