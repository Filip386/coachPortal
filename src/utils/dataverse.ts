import type { IOperationResult } from "@microsoft/power-apps/data";

export function unwrap<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = result as Record<string, unknown>;
  if (Array.isArray(r?.value)) return r.value as T[];
  if (Array.isArray(r?.data)) return r.data as T[];
  return [];
}

export function unwrapOrThrow<T>(res: IOperationResult<T[]>): T[] {
  if (!res.success) {
    const msg = (res.error as any)?.message ?? String(res.error ?? "Dataverse fetch failed");
    throw new Error(msg);
  }
  return unwrap<T>(res);
}

/** Reads a lookup display name from a Dataverse record.
 *  Checks the typed partner attribute first, then the OData formatted-value annotation. */
export function lookupName(record: unknown, field: string): string | null {
  const r = record as Record<string, unknown>;
  return (
    (r?.[`${field}name`] as string | null | undefined) ||
    (r?.[`_${field}_value@OData.Community.Display.V1.FormattedValue`] as string | null | undefined) ||
    null
  );
}

export async function fetchAllPages<T>(
  fetcher: (skipToken?: string) => Promise<IOperationResult<T[]>>
): Promise<T[]> {
  const all: T[] = [];
  let skipToken: string | undefined;
  do {
    const res = await fetcher(skipToken);
    all.push(...unwrapOrThrow<T>(res));
    skipToken = res.skipToken;
  } while (skipToken);
  return all;
}
