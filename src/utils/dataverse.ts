/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IOperationResult } from "@microsoft/power-apps/data";
import { getContext } from "@microsoft/power-apps/app";
import { EquipmentsService } from "../generated/services/EquipmentsService";
import { MicrosoftDataverseService } from "../generated/services/MicrosoftDataverseService";

export interface Facility {
  id: string;
  name: string;
}

// The generic Dataverse connector needs an explicit organization URL because
// the connection has no default organization. Resolved from the Power Apps
// host at runtime (instead of hardcoded) so the same build works unmodified
// across environments (e.g. prod and Dev2).
let cachedOrgUrl: string | null = null;

async function getOrgUrl(): Promise<string> {
  if (cachedOrgUrl) return cachedOrgUrl;
  const ctx = await getContext();
  if (!ctx.app.dataverseOrgUrl) {
    throw new Error(
      "No Dataverse organization URL available from the app context."
    );
  }
  cachedOrgUrl = ctx.app.dataverseOrgUrl;
  return cachedOrgUrl;
}

/** Security role names (e.g. "Back office") assigned to the Dataverse
 *  systemuser matching the given Azure AD object id. Uses the standard
 *  out-of-box systemuser <-> role relationship, "systemuserroles_association". */
export async function fetchUserSecurityRoles(azureObjectId: string): Promise<string[]> {
  const res = await MicrosoftDataverseService.ListRecordsWithOrganization(
    await getOrgUrl(),
    "systemusers",
    undefined,
    undefined,
    undefined,
    undefined,
    "systemuserid",
    `azureactivedirectoryobjectid eq '${azureObjectId}'`,
    undefined,
    "systemuserroles_association($select=name)"
  );
  if (!res.success) {
    const msg = (res.error as any)?.message ?? "Failed to load security roles";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  const data = res.data as Record<string, unknown> | undefined;
  const users = (data?.value ?? []) as any[];
  return users.flatMap((u) => (u.systemuserroles_association ?? []) as any[]).map((r) => (r?.name as string) ?? "").filter(Boolean);
}

function toFacilities(items: any[]): Facility[] {
  return items
    .map((item: any) => {
      const rec = (item?.dynamicProperties ?? item) as Record<string, unknown>;
      const id = rec?.equipmentid as string | undefined;
      const name = rec?.name as string | undefined;
      return id && name ? { id, name } : null;
    })
    .filter((f: any): f is Facility => f !== null)
    .sort((a: Facility, b: Facility) => a.name.localeCompare(b.name));
}

export async function fetchFacilities(): Promise<Facility[]> {
  // Preferred: typed service (works once the table is registered platform-side)
  try {
    const res = await EquipmentsService.getAll({ select: ["equipmentid", "name"] });
    if (res.success) {
      const facilities = toFacilities(unwrap<any>(res));
      if (facilities.length > 0) return facilities;
    }
  } catch {
    // fall through to connector path
  }

  // Fallback: generic Dataverse connector with explicit organization URL
  const res = await MicrosoftDataverseService.ListRecordsWithOrganization(
    await getOrgUrl(),
    "equipments",
    undefined,
    undefined,
    undefined,
    undefined,
    "equipmentid,name"
  );
  if (!res.success) {
    const msg = (res.error as any)?.message ?? "Failed to load facilities";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  const data = res.data as Record<string, unknown> | undefined;
  const items = (data?.value ?? (data as any)?.items ?? []) as any[];
  return toFacilities(items);
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
