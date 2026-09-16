import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { FileKeyPartPipe } from './file-key-part.pipe.js';
import { FilesService } from './files.service.js';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get(':fileType/:fileId')
  @Header('Content-Type', 'application/octet-stream')
  async download(
    @Param('fileType', FileKeyPartPipe) fileType: string,
    @Param('fileId', FileKeyPartPipe) fileId: string,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.files.download(fileType, fileId));
  }

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
