import {
  BadRequestException,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';

const FILE_KEY_PART_PATTERN = /^[A-Za-z0-9_-]+$/;

export class FileKeyPartPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!FILE_KEY_PART_PATTERN.test(value)) {
      throw new BadRequestException(
        `${metadata.data ?? 'value'} contains invalid characters.`,
      );
    }

    return value;
  }
}
