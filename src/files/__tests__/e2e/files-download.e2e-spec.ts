import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { FileStorageType } from '../../persistance/file-storage-type.js';
import { cleanFilesE2eData } from './files-e2e-data.js';
import {
  createFilesE2eContext,
  type FilesE2eContext,
} from './files-e2e-support.js';

const fileTypePrefix = 'download-e2e';

describe('Files download e2e', () => {
  let context: FilesE2eContext;

  beforeAll(async () => {
    context = await createFilesE2eContext();
    await cleanFilesE2eData(context, fileTypePrefix);
  }, 30_000);

  afterAll(async () => {
    await cleanFilesE2eData(context, fileTypePrefix);
    await context.app.close();
  });

  it('downloads an uploaded hot file', async () => {
    const { app } = context;
    const fileType = `${fileTypePrefix}-${randomUUID()}`;
    const fileId = randomUUID();
    const body = Buffer.from([0xde, 0xad, 0xbe, 0xef]);

    await request(app.getHttpServer())
      .post(`/v1/files/${fileType}/${fileId}`)
      .set('Content-Type', 'application/octet-stream')
      .send(body)
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/v1/files/${fileType}/${fileId}`)
      .expect('Content-Type', /application\/octet-stream/)
      .expect(200);

    expect(response.body).toEqual(body);
  });

  it('returns not found for a missing file', async () => {
    const { app } = context;

    await request(app.getHttpServer())
      .get(`/v1/files/${fileTypePrefix}-${randomUUID()}/missing`)
      .expect(404);
  });

  it('rejects an invalid path param', async () => {
    const { app } = context;

    await request(app.getHttpServer())
      .get(`/v1/files/${fileTypePrefix}.invalid/123`)
      .expect(400);
  });

  it('downloads an archived file', async () => {
    const { app, metadataRepository, storage } = context;
    const fileType = `${fileTypePrefix}-${randomUUID()}`;
    const fileId = randomUUID();
    const body = Buffer.from('archived file');
    const key = `${fileType}/${fileId}`;

    await metadataRepository.save({
      fileType,
      fileId,
      storageType: FileStorageType.ARCHIVE,
    });
    await storage.put(FileStorageType.ARCHIVE, key, body);

    const response = await request(app.getHttpServer())
      .get(`/v1/files/${fileType}/${fileId}`)
      .expect('Content-Type', /application\/octet-stream/)
      .expect(200);

    expect(response.body).toEqual(body);
  });
});
