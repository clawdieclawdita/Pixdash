import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

export function createValidator<T>(schema: object): ValidateFunction<T> {
  return ajv.compile<T>(schema);
}

export function assertValid<T>(validator: ValidateFunction<T>, payload: unknown, message: string): T {
  if (validator(payload)) {
    return payload;
  }

  const details = formatAjvErrors(validator.errors ?? []);
  throw new Error(`${message}: ${details}`);
}

export function formatAjvErrors(errors: ErrorObject[]): string {
  return errors.map((error) => `${error.instancePath || '/'} ${error.message ?? 'validation error'}`).join('; ');
}
