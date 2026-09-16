import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { FileStorageType } from '../../persistance/file-storage-type.js';
import { cleanFilesE2eData } from './files-e2e-data.js';
import {
  createFilesE2eContext,
  type FilesE2eContext,
} from './files-e2e-support.js';

const fileTypePrefix = 'delete-e2e';

describe('Files delete e2e', () => {
  let context: FilesE2eContext;

  beforeAll(async () => {
    context = await createFilesE2eContext();
    await cleanFilesE2eData(context, fileTypePrefix);
  }, 30_000);

  afterAll(async () => {
    await cleanFilesE2eData(context, fileTypePrefix);
    await context.app.close();
  });

  it('deletes an uploaded hot file', async () => {
    const { app, cache, metadataRepository, storage } = context;
    const fileType = `${fileTypePrefix}-${randomUUID()}`;
    const fileId = randomUUID();
    const body = Buffer.from('file to delete');
    const key = `${fileType}/${fileId}`;

    await request(app.getHttpServer())
      .post(`/v1/files/${fileType}/${fileId}`)
      .set('Content-Type', 'application/octet-stream')
      .send(body)
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/files/${fileType}/${fileId}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/v1/files/${fileType}/${fileId}`)
      .expect(404);
    await expect(storage.exists(FileStorageType.HOT, key)).resolves.toBe(false);
    await expect(
      metadataRepository.findOneBy({ fileType, fileId }),
    ).resolves.toBeNull();
    await expect(cache.hasHotFile(fileType, fileId)).resolves.toBe(false);
  });

  it('returns not found for a missing file', async () => {
    const { app } = context;

    await request(app.getHttpServer())
      .delete(`/v1/files/${fileTypePrefix}-${randomUUID()}/missing`)
      .expect(404);
  });

  it('rejects an invalid path param', async () => {
    const { app } = context;

    await request(app.getHttpServer())
      .delete(`/v1/files/${fileTypePrefix}.invalid/123`)
      .expect(400);
  });

  it('deletes an archived file', async () => {
    const { app, cache, metadataRepository, storage } = context;
    const fileType = `${fileTypePrefix}-${randomUUID()}`;
    const fileId = randomUUID();
    const body = Buffer.from('archived file to delete');
    const key = `${fileType}/${fileId}`;

    await metadataRepository.save({
      fileType,
      fileId,
      storageType: FileStorageType.ARCHIVE,
    });
    await storage.put(FileStorageType.ARCHIVE, key, body);

    await request(app.getHttpServer())
      .delete(`/v1/files/${fileType}/${fileId}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/v1/files/${fileType}/${fileId}`)
      .expect(404);
    await expect(storage.exists(FileStorageType.ARCHIVE, key)).resolves.toBe(
      false,
    );
    await expect(
      metadataRepository.findOneBy({ fileType, fileId }),
    ).resolves.toBeNull();
    await expect(cache.hasHotFile(fileType, fileId)).resolves.toBe(false);
  });
});
