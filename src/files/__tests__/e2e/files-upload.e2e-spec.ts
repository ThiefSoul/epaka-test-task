import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { FileStorageType } from '../../persistance/file-storage-type.js';
import {
  cleanFilesE2eData,
  createFilesE2eContext,
  type FilesE2eContext,
} from './files-e2e-support.js';

const fileTypePrefix = 'upload-e2e';

describe('Files upload e2e', () => {
  let context: FilesE2eContext;

  beforeAll(async () => {
    context = await createFilesE2eContext();
    await cleanFilesE2eData(context, fileTypePrefix);
  }, 30_000);

  afterAll(async () => {
    await cleanFilesE2eData(context, fileTypePrefix);
    await context.app.close();
  });

  it('uploads a binary body to hot storage', async () => {
    const { app, storage } = context;
    const fileType = `${fileTypePrefix}-${randomUUID()}`;
    const fileId = randomUUID();
    const body = Buffer.from([0xde, 0xad, 0xbe, 0xef]);

    await request(app.getHttpServer())
      .post(`/files/${fileType}/${fileId}`)
      .set('Content-Type', 'application/octet-stream')
      .send(body)
      .expect(201);

    await expect(
      storage.get(FileStorageType.HOT, `${fileType}/${fileId}`),
    ).resolves.toEqual(body);
  });

  it('rejects an empty body', async () => {
    const { app } = context;

    await request(app.getHttpServer())
      .post(`/files/${fileTypePrefix}-${randomUUID()}/empty`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(0))
      .expect(400);
  });

  it('returns conflict for duplicate file type and id', async () => {
    const { app } = context;
    const fileType = `${fileTypePrefix}-${randomUUID()}`;
    const fileId = randomUUID();
    const body = Buffer.from('test file');

    await request(app.getHttpServer())
      .post(`/files/${fileType}/${fileId}`)
      .set('Content-Type', 'application/octet-stream')
      .send(body)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/files/${fileType}/${fileId}`)
      .set('Content-Type', 'application/octet-stream')
      .send(body)
      .expect(409);
  });

  it('rejects an invalid path param', async () => {
    const { app } = context;

    await request(app.getHttpServer())
      .post(`/files/${fileTypePrefix}.invalid/123`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('test file'))
      .expect(400);
  });
});
