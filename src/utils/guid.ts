export const normalizeGuid = (value?: string | null): string =>
  (value ?? "").replace(/[{}]/g, "").trim().toLowerCase();

export const sameGuid = (left?: string | null, right?: string | null): boolean => {
  const normalizedLeft = normalizeGuid(left);
  return Boolean(normalizedLeft) && normalizedLeft === normalizeGuid(right);
};
