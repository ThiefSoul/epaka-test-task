import { randomUUID } from 'node:crypto';
import { FileStorageType } from '../../persistance/file-storage-type.js';
import { cleanFilesE2eData, createHotFile } from './files-e2e-data.js';
import {
  createFilesE2eContext,
  type FilesE2eContext,
} from './files-e2e-support.js';

const fileTypePrefix = 'archiving-e2e';

describe('Files archiving e2e', () => {
  let context: FilesE2eContext;

  beforeAll(async () => {
    context = await createFilesE2eContext();
    await cleanFilesE2eData(context, fileTypePrefix);
  }, 30_000);

  afterAll(async () => {
    await cleanFilesE2eData(context, fileTypePrefix);
    await context.app.close();
  });

  it('archives only hot files older than configured age', async () => {
    const { archiver } = context;
    const fileType = `${fileTypePrefix}-${randomUUID()}`;
    const freshFile = await createHotFileCreatedDaysAgo(fileType, 29);
    const oldFile = await createHotFileCreatedDaysAgo(fileType, 31);

    await archiver.archiveEligibleFiles();

    await expectArchivedFile(oldFile);
    await expectHotFile(freshFile);
  });

  async function createHotFileCreatedDaysAgo(
    fileType: string,
    ageInDays: number,
  ): Promise<TestFile> {
    const fileId = randomUUID();

    await createHotFile(context, fileType, fileId);
    await context.metadataRepository.update(
      { fileType, fileId },
      { createdAt: daysAgo(ageInDays) },
    );

    return {
      fileKeyPrefix: fileType,
      fileId,
      key: `${fileType}/${fileId}`,
      content: Buffer.from(`${FileStorageType.HOT}/${fileType}/${fileId}`),
    };
  }

  async function expectArchivedFile(file: TestFile): Promise<void> {
    const { cache, metadataRepository, storage } = context;

    await expect(storage.exists(FileStorageType.HOT, file.key)).resolves.toBe(
      false,
    );
    await expect(
      storage.exists(FileStorageType.ARCHIVE, file.key),
    ).resolves.toBe(true);
    await expect(
      storage.get(FileStorageType.ARCHIVE, file.key),
    ).resolves.toEqual(file.content);
    await expect(
      metadataRepository.findOneBy({
        fileType: file.fileKeyPrefix,
        fileId: file.fileId,
      }),
    ).resolves.toMatchObject({
      fileType: file.fileKeyPrefix,
      fileId: file.fileId,
      storageType: FileStorageType.ARCHIVE,
    });
    await expect(
      cache.hasHotFile(file.fileKeyPrefix, file.fileId),
    ).resolves.toBe(false);
  }

  async function expectHotFile(file: TestFile): Promise<void> {
    const { cache, metadataRepository, storage } = context;

    await expect(storage.exists(FileStorageType.HOT, file.key)).resolves.toBe(
      true,
    );
    await expect(
      storage.exists(FileStorageType.ARCHIVE, file.key),
    ).resolves.toBe(false);
    await expect(
      metadataRepository.findOneBy({
        fileType: file.fileKeyPrefix,
        fileId: file.fileId,
      }),
    ).resolves.toMatchObject({
      fileType: file.fileKeyPrefix,
      fileId: file.fileId,
      storageType: FileStorageType.HOT,
    });
    await expect(
      cache.hasHotFile(file.fileKeyPrefix, file.fileId),
    ).resolves.toBe(true);
  }
});

type TestFile = {
  fileKeyPrefix: string;
  fileId: string;
  key: string;
  content: Buffer;
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
