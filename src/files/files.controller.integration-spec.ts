import { ConflictException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { raw } from 'express';
import request from 'supertest';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';

describe('FilesController upload', () => {
  let app: INestApplication;
  let files: {
    upload: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    files = {
      upload: vi.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        {
          provide: FilesService,
          useValue: files,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(
      '/files/:fileType/:fileId',
      raw({ type: 'application/octet-stream', limit: '10mb' }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('uploads a binary body', async () => {
    const body = Buffer.from([0xde, 0xad, 0xbe, 0xef]);

    await request(app.getHttpServer())
      .post('/files/invoice/123')
      .set('Content-Type', 'application/octet-stream')
      .send(body)
      .expect(201);

    expect(files.upload).toHaveBeenCalledWith('invoice', '123', body);
  });

  it('rejects an empty body', async () => {
    await request(app.getHttpServer())
      .post('/files/invoice/123')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(0))
      .expect(400);

    expect(files.upload).not.toHaveBeenCalled();
  });

  it('returns conflict for duplicate file type and id', async () => {
    files.upload.mockRejectedValue(new ConflictException('File already exists.'));

    await request(app.getHttpServer())
      .post('/files/invoice/123')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('test file'))
      .expect(409);
  });

  it('rejects file type containing invalid characters', async () => {
    await request(app.getHttpServer())
      .post('/files/invoice%2F2026/123')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('test file'))
      .expect(400);

    expect(files.upload).not.toHaveBeenCalled();
  });

  it('rejects file id containing invalid characters', async () => {
    await request(app.getHttpServer())
      .post('/files/invoice/123%2F456')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('test file'))
      .expect(400);

    expect(files.upload).not.toHaveBeenCalled();
  });
});
