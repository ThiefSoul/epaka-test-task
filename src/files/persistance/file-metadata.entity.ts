import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { FileStorageType } from './file-storage-type.js';

@Entity('file_metadata')
@Unique(['fileType', 'fileId'])
@Index(['fileType'])
@Index(['storageType', 'createdAt'])
export class FileMetadataEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'file_type' })
  fileType: string;

  @Column({ name: 'file_id' })
  fileId: string;

  @Column({
    name: 'storage_type',
    type: 'enum',
    enum: FileStorageType,
    default: FileStorageType.HOT,
  })
  storageType: FileStorageType;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
