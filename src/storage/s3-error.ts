type S3Error = {
  name?: string;
  $metadata?: {
    httpStatusCode?: number;
  };
};

export function isS3NotFoundError(error: unknown): boolean {
  const s3Error = error as S3Error;

  return (
    s3Error.$metadata?.httpStatusCode === 404 || s3Error.name === 'NotFound'
  );
}
