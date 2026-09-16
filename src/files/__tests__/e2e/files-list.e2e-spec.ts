import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  cleanFilesE2eData,
  createArchivedFile,
  createHotFile,
} from './files-e2e-data.js';
import {
  createFilesE2eContext,
  type FilesE2eContext,
} from './files-e2e-support.js';

const fileTypePrefix = 'list-e2e';

describe('Files list e2e', () => {
  let context: FilesE2eContext;

  beforeAll(async () => {
    context = await createFilesE2eContext();
    await cleanFilesE2eData(context, fileTypePrefix);
  }, 30_000);

  afterAll(async () => {
    await cleanFilesE2eData(context, fileTypePrefix);
    await context.app.close();
  });

  it('lists file ids for a file type', async () => {
    const { app } = context;
    const fileType = `${fileTypePrefix}-${randomUUID()}`;
    const hotFileId = randomUUID();
    const archiveFileId = randomUUID();

    await createHotFile(context, fileType, hotFileId);
    await createArchivedFile(context, fileType, archiveFileId);

    const response = await request(app.getHttpServer())
      .get(`/files/${fileType}`)
      .expect(200);

    expect(response.body.ids).toHaveLength(2);
    expect(response.body.ids).toEqual(
      expect.arrayContaining([hotFileId, archiveFileId]),
    );
  });

  it('rejects invalid file type', async () => {
    const { app } = context;

    await request(app.getHttpServer()).get('/files/invalid.type').expect(400);
  });
});
