import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import { FilesService } from './files.service.js';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Put(':fileType/:fileId')
  @HttpCode(HttpStatus.CREATED)
  async upload(
    @Param('fileType') fileType: string,
    @Param('fileId') fileId: string,
    @Body() body: Buffer,
  ): Promise<void> {
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException('File body is required.');
    }

    await this.files.upload(fileType, fileId, body);
  }
}
