import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { FileStorageType } from '../../persistance/file-storage-type.js';
import {
  cleanFilesE2eData,
  createArchivedFile,
  createHotFile,
} from './files-e2e-data.js';
import {
  createFilesE2eContext,
  type FilesE2eContext,
} from './files-e2e-support.js';

const fileTypePrefix = 'status-e2e';

describe('Files status e2e', () => {
  let context: FilesE2eContext;

  beforeAll(async () => {
    context = await createFilesE2eContext();
    await cleanFilesE2eData(context, fileTypePrefix);
  }, 30_000);

  afterAll(async () => {
    await cleanFilesE2eData(context, fileTypePrefix);
    await context.app.close();
  });

  it('returns statuses for requested file ids', async () => {
    const { app } = context;
    const fileType = `${fileTypePrefix}-${randomUUID()}`;
    const hotFileId = randomUUID();
    const archiveFileId = randomUUID();
    const missingFileId = randomUUID();

    await createHotFile(context, fileType, hotFileId);
    await createArchivedFile(context, fileType, archiveFileId);

    const response = await request(app.getHttpServer())
      .post(`/v1/files/${fileType}/status`)
      .send({ ids: [hotFileId, archiveFileId, missingFileId] })
      .expect(200);

    expect(response.body).toEqual({
      files: [
        { id: hotFileId, exists: true, storageType: FileStorageType.HOT },
        {
          id: archiveFileId,
          exists: true,
          storageType: FileStorageType.ARCHIVE,
        },
        { id: missingFileId, exists: false, storageType: null },
      ],
    });
  });

  it('rejects invalid status request body', async () => {
    const { app } = context;

    await request(app.getHttpServer())
      .post(`/v1/files/${fileTypePrefix}/status`)
      .send({ ids: ['valid', 'invalid.id'] })
      .expect(400);
  });
});
