/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IOperationResult } from "@microsoft/power-apps/data";
import { MicrosoftDataverseService } from "../generated/services/MicrosoftDataverseService";

export interface Facility {
  id: string;
  name: string;
}

/** Fetches all rows from the axm365_facility ("Facility/Equipment") table.
 *  This table is exposed through the generic Microsoft Dataverse connector
 *  (added via `pac code add-data-source`), so records come back untyped — we
 *  read them defensively. Used to populate the event location dropdown. */
export async function fetchFacilities(): Promise<Facility[]> {
  const res = await MicrosoftDataverseService.ListRecords("axm365_facilities");
  if (!res.success) {
    const msg = (res.error as any)?.message ?? "Failed to load facilities";
    throw new Error(msg);
  }
  const items = (res.data?.value ?? []) as any[];
  const facilities = items
    .map((item) => {
      // Connector may nest the row under dynamicProperties or return it flat.
      const rec = (item?.dynamicProperties ?? item) as Record<string, unknown>;
      const id = rec?.["axm365_facilityid"] as string | undefined;
      const name = (rec?.["axm365_name"] as string | undefined) ?? "";
      return id ? { id, name: name || id } : null;
    })
    .filter((f): f is Facility => f !== null);
  return facilities.sort((a, b) => a.name.localeCompare(b.name));
}

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
