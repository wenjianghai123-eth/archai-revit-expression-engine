export interface ParsedApiResponse<T> {
  status: number;
  data: T | null;
}

export async function parseApiResponse<T>(response: Response): Promise<T | null> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();

  if (!text.trim()) {
    throw new Error(`API returned empty response. status=${response.status}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `API returned non-JSON response. status=${response.status}, body=${text.slice(0, 300)}`,
    );
  }

  if (!response.ok) {
    const message = readApiErrorMessage(data) || `API request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export async function parseApiResponseEnvelope<T>(response: Response): Promise<ParsedApiResponse<T>> {
  const data = await parseApiResponse<T>(response);
  return {
    status: response.status,
    data,
  };
}

export function readApiErrorMessage(value: unknown, fallbackStatus?: number): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (isRecord(value)) {
    if (typeof value.message === 'string' && value.message.trim().length > 0) {
      return value.message;
    }

    if (typeof value.error === 'string' && value.error.trim().length > 0) {
      return value.error;
    }

    if (isRecord(value.error) && typeof value.error.message === 'string' && value.error.message.trim().length > 0) {
      return value.error.message;
    }
  }

  if (fallbackStatus) {
    return `API request failed with status ${fallbackStatus}`;
  }

  return null;
}

export function readNonJsonResponseError(response: Response, body: string): Error {
  return new Error(
    `API returned non-JSON response. status=${response.status}, body=${body.slice(0, 300)}`,
  );
}

function readErrorMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (isRecord(value)) {
    if (typeof value.message === 'string' && value.message.trim().length > 0) {
      return value.message;
    }

    if (typeof value.error === 'string' && value.error.trim().length > 0) {
      return value.error;
    }

    if (isRecord(value.error) && typeof value.error.message === 'string' && value.error.message.trim().length > 0) {
      return value.error.message;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
