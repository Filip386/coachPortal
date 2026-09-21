/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IOperationResult } from "@microsoft/power-apps/data";
import { getContext } from "@microsoft/power-apps/app";
import { EquipmentsService } from "../generated/services/EquipmentsService";
import { MicrosoftDataverseService } from "../generated/services/MicrosoftDataverseService";
import { ContactsService } from "../generated/services/ContactsService";

export interface Facility {
  id: string;
  name: string;
}

/** An open Task activity from a Coach record's Dataverse timeline
 *  (regardingobjectid = the coach). Surfaced in-app as a notification. */
export interface CoachTask {
  id: string;
  subject: string;
  description: string | null;
  dueDate: string | null;
  priority: "Low" | "Normal" | "High";
  createdOn: string | null;
}

const TASK_PRIORITY: Record<number, CoachTask["priority"]> = {
  0: "Low",
  1: "Normal",
  2: "High",
};

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

const TASK_SELECT = "activityid,subject,description,scheduledend,prioritycode,createdon";

function failMessage(res: { error?: unknown }, fallback: string): string {
  const msg = (res.error as any)?.message ?? fallback;
  return typeof msg === "string" ? msg : JSON.stringify(msg);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

/** Open (statecode = 0) Task activities regarding the given Coach record —
 *  i.e. what shows up in that Coach's Dataverse timeline as an active task.
 *  "task" has no generated service/model, so this goes through the generic
 *  Dataverse connector. It tries the current-environment operation first —
 *  it needs no organization URL, which the Power Apps mobile player does not
 *  reliably provide — then falls back to the org-URL operation. Each attempt
 *  is time-boxed so a stalled mobile handshake can't hang forever. */
export async function fetchOpenCoachTasks(coachId: string): Promise<CoachTask[]> {
  const filter = `_regardingobjectid_value eq ${coachId} and statecode eq 0`;
  // Newest first — matches the default sort of the Coach record's Dataverse
  // timeline. createdon (not scheduledend) because it is always populated.
  const orderBy = "createdon desc";

  const attempts: Array<() => Promise<IOperationResult<Record<string, unknown>>>> = [
    () =>
      MicrosoftDataverseService.ListRecords(
        "tasks", undefined, undefined, undefined, TASK_SELECT, filter, orderBy
      ) as Promise<IOperationResult<Record<string, unknown>>>,
    async () =>
      MicrosoftDataverseService.ListRecordsWithOrganization(
        await getOrgUrl(), "tasks", undefined, undefined, undefined, undefined, TASK_SELECT, filter, orderBy
      ),
  ];

  const errors: string[] = [];
  let data: Record<string, unknown> | undefined;

  for (const attempt of attempts) {
    try {
      const res = await withTimeout(attempt(), 20000, "Loading notifications");
      if (res.success) {
        data = res.data as Record<string, unknown> | undefined;
        errors.length = 0;
        break;
      }
      errors.push(failMessage(res, "Failed to load notifications"));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (errors.length > 0) {
    console.error("[CoachPortal] Loading notifications failed:", errors);
    throw new Error(errors.join(" | "));
  }

  const items = (data?.value ?? []) as any[];
  return items
    .map((t) => {
      const id = t?.activityid as string | undefined;
      if (!id) return null;
      return {
        id,
        subject: (t?.subject as string) || "Untitled task",
        description: (t?.description as string) ?? null,
        dueDate: (t?.scheduledend as string) ?? null,
        priority: TASK_PRIORITY[t?.prioritycode as number] ?? "Normal",
        createdOn: (t?.createdon as string) ?? null,
      } as CoachTask;
    })
    .filter((t): t is CoachTask => t !== null);
}

/** Marks a Task as Completed (statecode 1 / statuscode 5 — the standard
 *  Dataverse "Completed" combination for the activity table). Same
 *  current-environment-first strategy as the read above. */
export async function completeCoachTask(taskId: string): Promise<void> {
  const body = { statecode: 1, statuscode: 5 };
  const errors: string[] = [];

  const attempts: Array<() => Promise<IOperationResult<Record<string, unknown>>>> = [
    () =>
      MicrosoftDataverseService.UpdateRecord(
        "return=representation", "application/json", "tasks", taskId, body
      ),
    async () =>
      MicrosoftDataverseService.UpdateRecordWithOrganization(
        "return=representation", "application/json", await getOrgUrl(), "tasks", taskId, body
      ),
  ];

  for (const attempt of attempts) {
    try {
      const res = await withTimeout(attempt(), 20000, "Updating the task");
      if (res.success) return;
      errors.push(failMessage(res, "Failed to update the task"));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  console.error("[CoachPortal] Completing task failed:", errors);
  throw new Error(errors.join(" | "));
}

/** Name + phone for the given Guardian Contact ids — the "Guardian" lookup
 *  on Player (cr9be_member) points at a Contact record, and both fields are
 *  read straight from there. mobilephone wins over telephone1 when a contact
 *  has both.
 *
 *  Ids are requested in small chunks: one OR-filter over the whole squad
 *  (100+ GUIDs) makes a request URL long enough for the mobile host to
 *  reject it. A chunk that fails is skipped rather than failing the batch,
 *  and the caller merges the result into what it already has. */
export interface GuardianContact {
  name: string | null;
  phone: string | null;
}

const GUARDIAN_CHUNK = 15;

export async function fetchGuardianContacts(memberIds: (string | undefined)[]): Promise<Record<string, GuardianContact>> {
  const uniqueIds = Array.from(new Set(memberIds.filter((id): id is string => !!id)));
  const map: Record<string, GuardianContact> = {};

  for (let i = 0; i < uniqueIds.length; i += GUARDIAN_CHUNK) {
    const chunk = uniqueIds.slice(i, i + GUARDIAN_CHUNK);
    try {
      const res = await withTimeout(
        ContactsService.getAll({
          filter: chunk.map((id) => `contactid eq ${id}`).join(" or "),
          select: ["contactid", "fullname", "telephone1", "mobilephone"],
        }),
        20000,
        "Loading guardians"
      );
      if (!res.success) {
        console.error("[CoachPortal] Guardian lookup failed:", res.error);
        continue;
      }
      unwrap<{ contactid: string; fullname?: string; telephone1?: string; mobilephone?: string }>(res).forEach((c) => {
        map[c.contactid] = {
          name: c.fullname || null,
          phone: c.mobilephone || c.telephone1 || null,
        };
      });
    } catch (err) {
      console.error("[CoachPortal] Guardian lookup failed:", err);
    }
  }

  return map;
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
