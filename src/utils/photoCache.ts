import { Cr9be_playersService } from "../generated/services/Cr9be_playersService";
import { blobToDataUrl, sniffImageMimeType, toImageBytes } from "./image";

const PHOTO_CACHE_NAME = "player-photos-v2";
const ABANDONED_PHOTO_CACHE_NAMES = ["player-photos-v1"];
const PICTURE_COLUMN = "cr9be_picture";
const PREFETCH_CONCURRENCY = 4;

type PictureSize = "full" | "thumbnail";

interface PlayerPictureRef {
  playerId: string;
  pictureId?: string | null;
  pictureVersion?: number;
}

const ignoreFailure = () => {};

const hasCacheStorage = (): boolean => "caches" in window;

if (typeof window !== "undefined" && hasCacheStorage()) {
  Promise.all(ABANDONED_PHOTO_CACHE_NAMES.map((name) => caches.delete(name))).catch(ignoreFailure);
}

function photoCacheKey(playerId: string, version?: number): string {
  return `https://player-photo.cache/${playerId}?v=${version ?? 0}`;
}

async function withPhotoCache<T>(fallback: T, run: (cache: Cache) => Promise<T>): Promise<T> {
  if (!hasCacheStorage()) return fallback;
  try {
    return await run(await caches.open(PHOTO_CACHE_NAME));
  } catch {
    return fallback;
  }
}

function getCachedPhoto(playerId: string, version?: number): Promise<Blob | null> {
  return withPhotoCache(null, async (cache) => {
    const match = await cache.match(photoCacheKey(playerId, version));
    return match ? match.blob() : null;
  });
}

function setCachedPhoto(playerId: string, version: number | undefined, blob: Blob): Promise<void> {
  return withPhotoCache(undefined, async (cache) => {
    const response = new Response(blob, { headers: { "Content-Type": blob.type } });
    await cache.put(photoCacheKey(playerId, version), response);
  });
}

export function clearCachedPhoto(playerId: string, version?: number): Promise<void> {
  return withPhotoCache(undefined, async (cache) => {
    await cache.delete(photoCacheKey(playerId, version));
  });
}

function bytesToBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: sniffImageMimeType(bytes) });
}

async function fetchPictureFromRecord(playerId: string): Promise<Blob | null> {
  try {
    const res = await Cr9be_playersService.get(playerId, { select: [PICTURE_COLUMN] });
    if (!res.success) {
      console.warn("[photoCache] record-select fetch failed", playerId, res.error);
      return null;
    }
    const bytes = toImageBytes(res.data?.cr9be_picture);
    return bytes ? bytesToBlob(bytes) : null;
  } catch (err) {
    console.warn("[photoCache] record-select fetch threw", playerId, err);
    return null;
  }
}

async function downloadPicture(playerId: string, size: PictureSize): Promise<Blob | null> {
  const label = size === "full" ? "full-size" : "thumbnail";
  try {
    const res = await Cr9be_playersService.downloadImage(playerId, PICTURE_COLUMN, size === "full");
    if (!res.success) {
      console.warn(`[photoCache] ${label} fetch failed`, playerId, res.error);
      return null;
    }
    const bytes = toImageBytes(res.data);
    if (!bytes) {
      console.warn(`[photoCache] ${label} fetch returned no decodable data`, playerId, typeof res.data);
      return null;
    }
    return bytesToBlob(bytes);
  } catch (err) {
    console.warn(`[photoCache] ${label} fetch threw`, playerId, err);
    return null;
  }
}

async function fetchPlayerPhotoBlob(playerId: string): Promise<Blob | null> {
  return (
    (await fetchPictureFromRecord(playerId)) ??
    (await downloadPicture(playerId, "full")) ??
    (await downloadPicture(playerId, "thumbnail"))
  );
}

async function fetchThumbnailBlob(playerId: string): Promise<Blob | null> {
  return (await fetchPictureFromRecord(playerId)) ?? (await downloadPicture(playerId, "thumbnail"));
}

export async function loadPlayerPhotoUrl(playerId: string, version?: number): Promise<string | null> {
  const cached = await getCachedPhoto(playerId, version);
  if (cached) return blobToDataUrl(cached);

  const blob = await fetchPlayerPhotoBlob(playerId);
  if (!blob) return null;
  setCachedPhoto(playerId, version, blob).catch(ignoreFailure);
  return blobToDataUrl(blob);
}

export async function reloadThumbnailUrl(playerId: string, version?: number): Promise<string | null> {
  const blob = await fetchThumbnailBlob(playerId);
  if (!blob) return null;
  setCachedPhoto(playerId, version, blob).catch(ignoreFailure);
  return blobToDataUrl(blob);
}

async function diagnosePlayerPhoto(playerId: string): Promise<void> {
  const describe = async (label: string, run: () => Promise<unknown>) => {
    try {
      const res = (await run()) as { success?: boolean; data?: unknown; error?: unknown };
      const data = res?.data;
      const picture = typeof data === "object" && data !== null && PICTURE_COLUMN in data
        ? (data as { cr9be_picture?: unknown }).cr9be_picture
        : data;
      const bytes = toImageBytes(picture);
      console.log(`[diagnose] ${label}`, {
        success: res?.success,
        error: res?.error,
        rawType: Object.prototype.toString.call(data),
        rawLength: (data as { length?: number })?.length,
        decodedBytes: bytes?.byteLength ?? 0,
        sniffedType: bytes ? sniffImageMimeType(bytes) : "n/a",
        firstBytes: bytes ? Array.from(bytes.slice(0, 4)).map((b) => "0x" + b.toString(16)) : [],
      });
    } catch (err) {
      console.log(`[diagnose] ${label} THREW`, err);
    }
  };

  console.log(`[diagnose] player ${playerId} — cacheStorage=${hasCacheStorage()}`);
  await describe("record $select=cr9be_picture", () => Cr9be_playersService.get(playerId, { select: [PICTURE_COLUMN] }));
  await describe("downloadImage(fullSize=true)", () => Cr9be_playersService.downloadImage(playerId, PICTURE_COLUMN, true));
  await describe("downloadImage(fullSize=false)", () => Cr9be_playersService.downloadImage(playerId, PICTURE_COLUMN, false));
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).diagnosePlayerPhoto = diagnosePlayerPhoto;
}

async function cachePhotoIfMissing(player: PlayerPictureRef): Promise<void> {
  const cached = await getCachedPhoto(player.playerId, player.pictureVersion);
  if (cached) return;
  const blob = await fetchPlayerPhotoBlob(player.playerId);
  if (blob) await setCachedPhoto(player.playerId, player.pictureVersion, blob);
}

export async function prefetchPlayerPhotos(players: PlayerPictureRef[]): Promise<void> {
  if (!hasCacheStorage()) return;
  const playersWithPictures = players.filter((player) => player.pictureId);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < playersWithPictures.length) {
      await cachePhotoIfMissing(playersWithPictures[nextIndex++]).catch(ignoreFailure);
    }
  };

  await Promise.all(Array.from({ length: PREFETCH_CONCURRENCY }, worker));
}
