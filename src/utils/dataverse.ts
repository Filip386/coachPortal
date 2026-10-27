/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IOperationResult } from "@microsoft/power-apps/data";
import { getContext } from "@microsoft/power-apps/app";
import { EquipmentsService } from "../generated/services/EquipmentsService";
import { MicrosoftDataverseService } from "../generated/services/MicrosoftDataverseService";

export interface Facility {
  id: string;
  name: string;
}

let cachedOrgUrl: string | null = null;

async function getOrgUrl(): Promise<string> {
  if (cachedOrgUrl) return cachedOrgUrl;
  const ctx = await getContext();
  if (!ctx.app.dataverseOrgUrl) {
    throw new Error("No Dataverse organization URL available from the app context.");
  }
  cachedOrgUrl = ctx.app.dataverseOrgUrl;
  return cachedOrgUrl;
}

export const operationErrorMessage = (error: unknown, fallbackMessage: string): string =>
  (error as any)?.message ?? JSON.stringify(error) ?? fallbackMessage;

function connectorError(error: unknown, fallbackMessage: string): Error {
  const message = (error as any)?.message ?? fallbackMessage;
  return new Error(typeof message === "string" ? message : JSON.stringify(message));
}

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
  if (!res.success) throw connectorError(res.error, "Failed to load security roles");

  const data = res.data as Record<string, unknown> | undefined;
  const users = (data?.value ?? []) as any[];
  return users
    .flatMap((user) => (user.systemuserroles_association ?? []) as any[])
    .map((role) => (role?.name as string) ?? "")
    .filter(Boolean);
}

function toFacilities(items: any[]): Facility[] {
  return items
    .map((item: any) => {
      const record = (item?.dynamicProperties ?? item) as Record<string, unknown>;
      const id = record?.equipmentid as string | undefined;
      const name = record?.name as string | undefined;
      return id && name ? { id, name } : null;
    })
    .filter((facility): facility is Facility => facility !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchFacilitiesFromEquipmentTable(): Promise<Facility[]> {
  try {
    const res = await EquipmentsService.getAll({ select: ["equipmentid", "name"] });
    return res.success ? toFacilities(unwrap<any>(res)) : [];
  } catch {
    return [];
  }
}

async function fetchFacilitiesFromConnector(): Promise<Facility[]> {
  const res = await MicrosoftDataverseService.ListRecordsWithOrganization(
    await getOrgUrl(),
    "equipments",
    undefined,
    undefined,
    undefined,
    undefined,
    "equipmentid,name"
  );
  if (!res.success) throw connectorError(res.error, "Failed to load facilities");

  const data = res.data as Record<string, unknown> | undefined;
  const items = (data?.value ?? (data as any)?.items ?? []) as any[];
  return toFacilities(items);
}

export async function fetchFacilities(): Promise<Facility[]> {
  const facilities = await fetchFacilitiesFromEquipmentTable();
  return facilities.length > 0 ? facilities : fetchFacilitiesFromConnector();
}

export function unwrap<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const record = result as Record<string, unknown>;
  if (Array.isArray(record?.value)) return record.value as T[];
  if (Array.isArray(record?.data)) return record.data as T[];
  return [];
}

export function unwrapOrThrow<T>(res: IOperationResult<T[]>): T[] {
  if (!res.success) {
    const message = (res.error as any)?.message ?? String(res.error ?? "Dataverse fetch failed");
    throw new Error(message);
  }
  return unwrap<T>(res);
}

export function lookupName(record: unknown, field: string): string | null {
  const values = record as Record<string, unknown>;
  return (
    (values?.[`${field}name`] as string | null | undefined) ||
    (values?.[`_${field}_value@OData.Community.Display.V1.FormattedValue`] as string | null | undefined) ||
    null
  );
}

export async function fetchAllPages<T>(
  fetchPage: (skipToken?: string) => Promise<IOperationResult<T[]>>
): Promise<T[]> {
  const rows: T[] = [];
  let skipToken: string | undefined;
  do {
    const res = await fetchPage(skipToken);
    rows.push(...unwrapOrThrow<T>(res));
    skipToken = res.skipToken;
  } while (skipToken);
  return rows;
}
