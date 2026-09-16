import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { FileCacheService } from '../../file-cache.service.js';

vi.mock('redis', () => ({
  createClient: vi.fn(),
}));

describe('FileCacheService', () => {
  let redisClient: {
    connect: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    sAdd: ReturnType<typeof vi.fn>;
    sIsMember: ReturnType<typeof vi.fn>;
    smIsMember: ReturnType<typeof vi.fn>;
    sRem: ReturnType<typeof vi.fn>;
    isOpen: boolean;
  };
  let service: FileCacheService;

  beforeEach(() => {
    redisClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
      sAdd: vi.fn().mockResolvedValue(1),
      sIsMember: vi.fn().mockResolvedValue(0),
      smIsMember: vi.fn().mockResolvedValue([]),
      sRem: vi.fn().mockResolvedValue(1),
      isOpen: true,
    };
    vi.mocked(createClient).mockReturnValue(redisClient as never);

    service = new FileCacheService({
      getOrThrow: vi.fn((key: string) => {
        const config = {
          REDIS_DB: 1,
          REDIS_HOST: 'redis',
          REDIS_PORT: 6379,
        };

        return config[key as keyof typeof config];
      }),
    } as unknown as ConfigService);
  });

  it('stores a hot file in a set', async () => {
    await service.rememberHotFile('invoice', '123');

    expect(redisClient.sAdd).toHaveBeenCalledWith('hot-files:invoice', ['123']);
  });

  it('stores many hot files in one set write', async () => {
    await service.rememberHotFiles('invoice', ['123', '124']);

    expect(redisClient.sAdd).toHaveBeenCalledWith('hot-files:invoice', [
      '123',
      '124',
    ]);
  });

  it('does not call Redis when there are no hot files to store', async () => {
    await service.rememberHotFiles('invoice', []);

    expect(redisClient.sAdd).not.toHaveBeenCalled();
  });

  it('returns true when a hot file exists in cache', async () => {
    redisClient.sIsMember.mockResolvedValue(1);

    await expect(service.hasHotFile('invoice', '123')).resolves.toBe(true);

    expect(redisClient.sIsMember).toHaveBeenCalledWith(
      'hot-files:invoice',
      '123',
    );
  });

  it('returns false when a file is missing from cache', async () => {
    redisClient.sIsMember.mockResolvedValue(0);

    await expect(service.hasHotFile('invoice', '123')).resolves.toBe(false);
  });

  it('reads hot file ids from one set', async () => {
    redisClient.smIsMember.mockResolvedValue([1, 0]);

    await expect(
      service.getHotFileIds('invoice', ['123', '999']),
    ).resolves.toEqual(new Set(['123']));

    expect(redisClient.smIsMember).toHaveBeenCalledWith('hot-files:invoice', [
      '123',
      '999',
    ]);
  });

  it('does not call Redis for empty bulk lookup', async () => {
    await expect(service.getHotFileIds('invoice', [])).resolves.toEqual(
      new Set(),
    );

    expect(redisClient.smIsMember).not.toHaveBeenCalled();
  });

  it('removes one file from the set', async () => {
    await service.forgetFile('invoice', '123');

    expect(redisClient.sRem).toHaveBeenCalledWith('hot-files:invoice', '123');
  });
});
