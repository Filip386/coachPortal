import type { DataResourceStatus } from "../context/DataContext";

export const hasUsableData = (status: DataResourceStatus): boolean =>
  status === "ready" || status === "refreshing" || status === "stale";

export const isNotLoadedYet = (status: DataResourceStatus): boolean =>
  status === "idle" || status === "loading";
