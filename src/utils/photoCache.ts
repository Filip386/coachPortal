import { Cr9be_playersService } from "../generated/services/Cr9be_playersService";
import { blobToDataUrl, sniffImageMimeType, toImageBytes } from "./image";

// v2: every entry v1 stored was built from the SDK's base64 *string* treated as raw bytes,
// so it holds unrenderable blobs. Bumping the name abandons them wholesale — a stale hit
// would otherwise keep serving a broken image forever, since it never reaches the network.
const CACHE_NAME = "player-photos-v2";
const LEGACY_CACHE_NAMES = ["player-photos-v1"];

if (typeof window !== "undefined" && "caches" in window) {
  Promise.all(LEGACY_CACHE_NAMES.map((name) => caches.delete(name))).catch(() => {});
}

function cacheKey(playerId: string, version?: number): string {
  return `https://player-photo.cache/${playerId}?v=${version ?? 0}`;
}

/** Persists across app close/reopen (browser Cache Storage), unlike an in-memory
 *  map — so a player's photo shows instantly next launch instead of re-downloading. */
export async function getCachedPhoto(playerId: string, version?: number): Promise<Blob | null> {
  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(cacheKey(playerId, version));
    return match ? await match.blob() : null;
  } catch {
    return null;
  }
}

export async function setCachedPhoto(playerId: string, version: number | undefined, blob: Blob): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey(playerId, version), new Response(blob, { headers: { "Content-Type": blob.type } }));
  } catch {
    // Quota pressure or a restrictive context — caching is a speed optimization, not required.
  }
}

export async function clearCachedPhoto(playerId: string, version?: number): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(cacheKey(playerId, version));
  } catch {
    // Non-fatal — worst case a stale entry lingers until Cache Storage reclaims it.
  }
}

function bytesToBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: sniffImageMimeType(bytes) });
}

/** Reads the picture out of the record body instead of the binary endpoint.
 *
 *  This is the primary source, and the reason is reliability rather than preference.
 *  `downloadImage()` hits Dataverse's `/$value` endpoint, which the SDK's transport
 *  mishandles in two separate ways: it base64-encodes the body whenever the server
 *  answers `Content-Type: image/*` (despite the `Uint8Array` return type), and it looks
 *  that header up case-sensitively — so a host that lowercases response headers falls
 *  into `return { success: true, data: undefined }`, a success with no bytes in it.
 *  Both failures are silent, which is why the avatar just quietly showed initials.
 *
 *  `$select`ing an image column instead returns it as base64 inside the ordinary JSON
 *  record — the same path every other screen in this app already loads data through. */
async function fetchPictureFromRecord(playerId: string): Promise<Blob | null> {
  try {
    const res = await Cr9be_playersService.get(playerId, { select: ["cr9be_picture"] });
    if (!res.success) {
      console.warn("[photoCache] record-select fetch failed", playerId, res.error);
      return null;
    }
    const bytes = toImageBytes(res.data?.cr9be_picture);
    if (!bytes) return null;
    return bytesToBlob(bytes);
  } catch (err) {
    console.warn("[photoCache] record-select fetch threw", playerId, err);
    return null;
  }
}

/** The binary `/$value` rendition — kept as a fallback because when the host does behave
 *  it returns the full-size original, which is sharper than the record's thumbnail. */
async function downloadRendition(playerId: string, fullSize: boolean): Promise<Blob | null> {
  const label = fullSize ? "full-size" : "thumbnail";
  try {
    const res = await Cr9be_playersService.downloadImage(playerId, "cr9be_picture", fullSize);
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

/** Walks every source we have, most-reliable first, and returns the first that yields
 *  real bytes. Ordering is deliberate: the record body works even on hosts where the
 *  binary endpoint silently returns nothing, and it's also the smallest payload. */
export async function fetchPlayerPhotoBlob(playerId: string): Promise<Blob | null> {
  return (
    (await fetchPictureFromRecord(playerId)) ??
    (await downloadRendition(playerId, true)) ??
    (await downloadRendition(playerId, false))
  );
}

/** Fetches only a small rendition — used when a photo downloaded fine but the device
 *  couldn't actually decode/render it (happens on mobile for large pre-existing photos
 *  that were never compressed; desktop browsers tolerate sizes phones choke on). */
export async function fetchThumbnailBlob(playerId: string): Promise<Blob | null> {
  return (await fetchPictureFromRecord(playerId)) ?? (await downloadRendition(playerId, false));
}

/** Cache-first load of a player's photo, returning a CSP-safe `data:` URL ready to drop
 *  straight into an `<img src>` — see `blobToDataUrl` for why it can't be a `blob:` URL.
 *  Cache Storage still holds Blobs; CSP governs document loads, not storage. It persists
 *  across app close/reopen, so a player seen once shows instantly next launch. */
export async function loadPlayerPhotoUrl(playerId: string, version?: number): Promise<string | null> {
  const cached = await getCachedPhoto(playerId, version);
  if (cached) return blobToDataUrl(cached);

  const blob = await fetchPlayerPhotoBlob(playerId);
  if (!blob) return null;
  setCachedPhoto(playerId, version, blob).catch(() => {});
  return blobToDataUrl(blob);
}

/** Network-only reload of the smallest rendition, as a `data:` URL. Used by the
 *  render-failure downgrade, so it deliberately skips the cache. */
export async function reloadThumbnailUrl(playerId: string, version?: number): Promise<string | null> {
  const blob = await fetchThumbnailBlob(playerId);
  if (!blob) return null;
  setCachedPhoto(playerId, version, blob).catch(() => {});
  return blobToDataUrl(blob);
}

/** Console helper for when a photo still won't appear: reports exactly what each source
 *  returned, so the failing layer is identifiable without another round of guessing.
 *  Run `window.diagnosePlayerPhoto("<playerId>")` from the device's dev tools. */
export async function diagnosePlayerPhoto(playerId: string): Promise<void> {
  const describe = async (label: string, run: () => Promise<unknown>) => {
    try {
      const raw = await run();
      const res = raw as { success?: boolean; data?: unknown; error?: unknown };
      const data = res?.data;
      const bytes = toImageBytes(typeof data === "object" && data !== null && "cr9be_picture" in data
        ? (data as { cr9be_picture?: unknown }).cr9be_picture
        : data);
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

  console.log(`[diagnose] player ${playerId} — cacheStorage=${"caches" in window}`);
  await describe("record $select=cr9be_picture", () => Cr9be_playersService.get(playerId, { select: ["cr9be_picture"] }));
  await describe("downloadImage(fullSize=true)", () => Cr9be_playersService.downloadImage(playerId, "cr9be_picture", true));
  await describe("downloadImage(fullSize=false)", () => Cr9be_playersService.downloadImage(playerId, "cr9be_picture", false));
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).diagnosePlayerPhoto = diagnosePlayerPhoto;
}

interface PlayerPictureRef {
  playerId: string;
  pictureId?: string | null;
  pictureVersion?: number;
}

const PREFETCH_CONCURRENCY = 4;

/** Warms the photo cache for the whole squad right after player data loads, so
 *  opening any individual player is a cache hit instead of the first-ever fetch
 *  happening at the moment the coach taps in and is staring at a spinner. Runs
 *  with limited concurrency in the background — never awaited by callers. */
export async function prefetchPlayerPhotos(players: PlayerPictureRef[]): Promise<void> {
  if (!("caches" in window)) return;
  const withPictures = players.filter((p) => p.pictureId);
  let index = 0;

  const worker = async () => {
    while (index < withPictures.length) {
      const player = withPictures[index++];
      try {
        const cached = await getCachedPhoto(player.playerId, player.pictureVersion);
        if (cached) continue;
        const blob = await fetchPlayerPhotoBlob(player.playerId);
        if (blob) await setCachedPhoto(player.playerId, player.pictureVersion, blob);
      } catch {
        // Best-effort warm-up — a miss here just falls back to the on-demand
        // fetch already built into PlayerAvatar when it's actually displayed.
      }
    }
  };

  await Promise.all(Array.from({ length: PREFETCH_CONCURRENCY }, worker));
}
