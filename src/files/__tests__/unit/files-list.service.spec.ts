import { Logger } from '@nestjs/common';
import { type Repository } from 'typeorm';
import { StorageService } from '../../../storage/storage.service.js';
import { FileCacheService } from '../../file-cache.service.js';
import { FileMetadataEntity } from '../../persistance/file-metadata.entity.js';
import { FilesService } from '../../files.service.js';

describe('FilesService list', () => {
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
    rememberHotFile: ReturnType<typeof vi.fn>;
    hasHotFile: ReturnType<typeof vi.fn>;
    getHotFileIds: ReturnType<typeof vi.fn>;
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
      rememberHotFile: vi.fn().mockResolvedValue(undefined),
      hasHotFile: vi.fn().mockResolvedValue(false),
      getHotFileIds: vi.fn().mockResolvedValue(new Set()),
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

  it('lists file ids from metadata', async () => {
    repository.find.mockResolvedValue([{ fileId: '123' }, { fileId: '124' }]);

    await expect(service.listIds('invoice')).resolves.toEqual({
      ids: ['123', '124'],
    });

    expect(repository.find).toHaveBeenCalledWith({
      where: { fileType: 'invoice' },
      order: { fileId: 'ASC' },
      select: { fileId: true },
    });

    expect(cache.getHotFileIds).not.toHaveBeenCalled();
  });
});
