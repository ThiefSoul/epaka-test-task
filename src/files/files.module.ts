import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../storage/storage.module.js';
import { FileArchiverService } from './file-archiver.service.js';
import { FileCacheService } from './file-cache.service.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { FileMetadataEntity } from './persistance/file-metadata.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([FileMetadataEntity]), StorageModule],
  controllers: [FilesController],
  providers: [FilesService, FileCacheService, FileArchiverService],
})
export class FilesModule {}
