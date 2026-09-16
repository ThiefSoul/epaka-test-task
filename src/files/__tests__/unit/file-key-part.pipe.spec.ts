import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { FileKeyPartPipe } from '../../file-key-part.pipe.js';

describe('FileKeyPartPipe', () => {
  const pipe = new FileKeyPartPipe();
  const metadata: ArgumentMetadata = {
    type: 'param',
    data: 'fileType',
  };

  it.each(['invoice', 'invoice_2026', 'invoice-2026', 'ABC123'])(
    'accepts %s',
    (value) => {
      expect(pipe.transform(value, metadata)).toBe(value);
    },
  );

  it.each(['invoice/2026', 'invoice.2026', 'invoice 2026', ''])(
    'rejects %s',
    (value) => {
      expect(() => pipe.transform(value, metadata)).toThrow(
        BadRequestException,
      );
    },
  );
});
