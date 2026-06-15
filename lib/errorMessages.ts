type Translator = (key: string, options?: Record<string, unknown>) => string;

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

export function getFriendlyErrorMessage(
  error: unknown,
  t: Translator,
  fallbackKey = 'common:errors.generic'
): string {
  const message = extractMessage(error).toLowerCase();

  if (message.includes('timed out')) {
    return t('common:errors.timeout');
  }

  if (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('request failed') ||
    message.includes('failed to fetch')
  ) {
    return t('common:errors.connection');
  }

  const translated = t(fallbackKey);
  return translated === fallbackKey ? fallbackKey : translated;
}
