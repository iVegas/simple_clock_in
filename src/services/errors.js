import { t } from '../i18n/index.js';

/** Error with a stable `code` the UI can react to (and translate: locales → "error.<code>"). */
export class ApiError extends Error {
  constructor(code, message, { status = 0 } = {}) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export function describeError(err) {
  const key = `error.${err?.code}`;
  const known = t(key);
  if (known !== key) return known;
  return err?.message || t('error.generic');
}
