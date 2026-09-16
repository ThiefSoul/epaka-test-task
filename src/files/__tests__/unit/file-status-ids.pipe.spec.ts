import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { FileStatusIdsPipe } from '../../file-status-ids.pipe.js';

describe('FileStatusIdsPipe', () => {
  const pipe = new FileStatusIdsPipe();
  const metadata: ArgumentMetadata = {
    type: 'body',
  };

  it('returns valid ids', () => {
    expect(pipe.transform({ ids: ['123', 'invoice-2026'] }, metadata)).toEqual([
      '123',
      'invoice-2026',
    ]);
  });

  it.each([{}, { ids: '123' }, { ids: null }])(
    'rejects body without ids array',
    (body) => {
      expect(() => pipe.transform(body, metadata)).toThrow(BadRequestException);
    },
  );

  it('rejects non-string ids', () => {
    expect(() => pipe.transform({ ids: ['123', 124] }, metadata)).toThrow(
      BadRequestException,
    );
  });

  it('rejects ids with invalid characters', () => {
    expect(() =>
      pipe.transform({ ids: ['123', 'invalid.id'] }, metadata),
    ).toThrow(BadRequestException);
  });
});
