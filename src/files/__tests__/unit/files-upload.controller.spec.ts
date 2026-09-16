import { BadRequestException } from '@nestjs/common';
import { FilesController } from '../../files.controller.js';
import { FilesService } from '../../files.service.js';

describe('FilesController', () => {
  let files: {
    upload: ReturnType<typeof vi.fn>;
  };
  let controller: FilesController;

  beforeEach(() => {
    files = {
      upload: vi.fn().mockResolvedValue(undefined),
    };
    controller = new FilesController(files as unknown as FilesService);
  });

  it('rejects empty body', async () => {
    await expect(
      controller.upload('invoice', '123', Buffer.alloc(0)),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(files.upload).not.toHaveBeenCalled();
  });
});
