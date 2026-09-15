import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileMetadataEntity } from './persistance/file-metadata.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([FileMetadataEntity])],
})
export class FilesModule {}
