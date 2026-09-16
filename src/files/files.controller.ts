import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { FileKeyPartPipe } from './file-key-part.pipe.js';
import { FilesService } from './files.service.js';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post(':fileType/:fileId')
  @HttpCode(HttpStatus.CREATED)
  async upload(
    @Param('fileType', FileKeyPartPipe) fileType: string,
    @Param('fileId', FileKeyPartPipe) fileId: string,
    @Body() body: Buffer,
  ): Promise<void> {
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException('File body is required.');
    }

    await this.files.upload(fileType, fileId, body);
  }
}
