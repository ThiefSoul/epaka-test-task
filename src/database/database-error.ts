import { QueryFailedError } from 'typeorm';

const POSTGRES_UNIQUE_VIOLATION = '23505';

type PostgresDriverError = {
  code?: string;
};

export function isPostgresUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as PostgresDriverError;
  return driverError.code === POSTGRES_UNIQUE_VIOLATION;
}
