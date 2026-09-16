import { ConflictException, Logger } from '@nestjs/common';
import { QueryFailedError, type Repository } from 'typeorm';
import { StorageService } from '../../../storage/storage.service.js';
import { FileCacheService } from '../../file-cache.service.js';
import { FileMetadataEntity } from '../../persistance/file-metadata.entity.js';
import { FileStorageType } from '../../persistance/file-storage-type.js';
import { FilesService } from '../../files.service.js';

describe('FilesService', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let repository: {
    insert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let storage: {
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let cache: {
    rememberHotFile: ReturnType<typeof vi.fn>;
  };
  let service: FilesService;

  beforeEach(() => {
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    repository = {
      insert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    };
    storage = {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    cache = {
      rememberHotFile: vi.fn().mockResolvedValue(undefined),
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

  it('stores uploaded file in hot storage', async () => {
    const body = Buffer.from('test file');

    await service.upload('invoice', '123', body);

    expect(storage.put).toHaveBeenCalledWith(
      FileStorageType.HOT,
      'invoice/123',
      body,
    );
  });

  it('persists file metadata', async () => {
    await service.upload('invoice', '123', Buffer.from('test file'));

    expect(repository.insert).toHaveBeenCalledWith({
      fileType: 'invoice',
      fileId: '123',
      storageType: FileStorageType.HOT,
    });
  });

  it('stores file after metadata is reserved', async () => {
    await service.upload('invoice', '123', Buffer.from('test file'));

    expect(repository.insert.mock.invocationCallOrder[0]).toBeLessThan(
      storage.put.mock.invocationCallOrder[0],
    );
  });

  it('updates file cache after successful upload', async () => {
    await service.upload('invoice', '123', Buffer.from('test file'));

    expect(cache.rememberHotFile).toHaveBeenCalledWith('invoice', '123');
  });

  it('throws conflict when unique constraint is violated', async () => {
    repository.insert.mockRejectedValue(uniqueViolationError());

    await expect(
      service.upload('invoice', '123', Buffer.from('test file')),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(storage.put).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
    expect(cache.rememberHotFile).not.toHaveBeenCalled();
  });

  it('does not store file when metadata save fails', async () => {
    const error = new Error('database failed');
    repository.insert.mockRejectedValue(error);

    await expect(
      service.upload('invoice', '123', Buffer.from('test file')),
    ).rejects.toBe(error);

    expect(storage.put).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
    expect(cache.rememberHotFile).not.toHaveBeenCalled();
  });

  it('deletes metadata when file storage fails', async () => {
    const error = new Error('storage failed');
    storage.put.mockRejectedValue(error);

    await expect(
      service.upload('invoice', '123', Buffer.from('test file')),
    ).rejects.toBe(error);

    expect(repository.delete).toHaveBeenCalledWith({
      fileType: 'invoice',
      fileId: '123',
    });
    expect(cache.rememberHotFile).not.toHaveBeenCalled();
  });

  it('does not fail upload when cache update fails', async () => {
    cache.rememberHotFile.mockRejectedValue(new Error('redis failed'));

    await expect(
      service.upload('invoice', '123', Buffer.from('test file')),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      'Uploaded file invoice/123, but cache update failed: redis failed',
    );
  });
});

function uniqueViolationError(): QueryFailedError {
  const driverError = Object.assign(new Error('duplicate key'), {
    code: '23505',
  });

  return new QueryFailedError('', [], driverError);
}
