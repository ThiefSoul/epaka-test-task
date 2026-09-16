import {
  BadRequestException,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import { FileKeyPartPipe } from './file-key-part.pipe.js';

type StatusRequestBody = {
  ids?: unknown;
};

export class FileStatusIdsPipe implements PipeTransform<unknown, string[]> {
  private readonly fileKeyPartPipe = new FileKeyPartPipe();

  transform(value: unknown, metadata: ArgumentMetadata): string[] {
    if (!this.isStatusRequestBody(value) || !Array.isArray(value.ids)) {
      throw new BadRequestException('ids must be an array.');
    }

    return value.ids.map((id) => {
      if (typeof id !== 'string') {
        throw new BadRequestException('ids must contain strings.');
      }

      return this.fileKeyPartPipe.transform(id, {
        ...metadata,
        data: 'ids',
      });
    });
  }

  private isStatusRequestBody(value: unknown): value is StatusRequestBody {
    return typeof value === 'object' && value !== null && 'ids' in value;
  }
}
