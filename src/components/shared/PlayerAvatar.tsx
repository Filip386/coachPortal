import React, { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, RefreshCw, Trash2 } from "lucide-react";
import { COLORS, displayStack, fontStack } from "../../constants/design";
import { Cr9be_playersService } from "../../generated/services/Cr9be_playersService";
import { blobToDataUrl, compressImageToUnder1MB } from "../../utils/image";
import { clearCachedPhoto, loadPlayerPhotoUrl, reloadThumbnailUrl } from "../../utils/photoCache";

interface PlayerAvatarProps {
  playerId: string;
  hasPicture: boolean;
  initials: string;
  size?: number;
  /** Dataverse's cr9be_picture_timestamp — changes every time the image column is
   *  written, so it's included in the fetch effect to bust the cache on a replace
   *  (hasPicture alone stays `true` across a re-upload and would never re-trigger it). */
  pictureVersion?: number;
  /** Lets the coach tap the avatar to take/upload a photo. Off by default (e.g. in list rows). */
  editable?: boolean;
  /** Renders explicit "Take Photo / Choose Photo / Remove Photo" rows below the avatar
   *  instead of relying on tapping the avatar itself — used in the Edit Player modal. */
  showActions?: boolean;
  onUploaded?: () => void;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  playerId,
  hasPicture,
  initials,
  size = 42,
  pictureVersion,
  editable = false,
  showActions = false,
  onUploaded,
}) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  // Guards the render-failure downgrade below to at most one retry per photo — without
  // this, a thumbnail that also somehow fails to render would retrigger onError forever.
  const thumbnailRetryTriedRef = useRef(false);

  // imgUrl is always a `data:` URL. The player's CSP is `img-src 'self' data:`, so the
  // `blob:` URLs from URL.createObjectURL() are blocked outright — see photoCache.
  useEffect(() => {
    thumbnailRetryTriedRef.current = false;
    if (!hasPicture) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setImgUrl(null);
      return;
    }
    let cancelled = false;

    loadPlayerPhotoUrl(playerId, pictureVersion)
      .then((url) => {
        if (!cancelled && url) setImgUrl(url);
      })
      .catch((err) => console.error("[PlayerAvatar] unexpected error loading photo", playerId, err));

    return () => {
      cancelled = true;
    };
  }, [playerId, hasPicture, pictureVersion]);

  // The image downloaded fine but the device couldn't decode/render it — happens on
  // mobile for large pre-existing photos that were never compressed (desktop tolerates
  // sizes phones choke on). Downgrade to the thumbnail, which is always small enough to
  // render, and overwrite the cache with it so this device doesn't hit the same failure
  // again next time.
  const handleImageRenderError = () => {
    setImgUrl(null);
    if (thumbnailRetryTriedRef.current) return;
    thumbnailRetryTriedRef.current = true;
    // Drop the cached copy first — if what we just failed to render came from Cache
    // Storage, leaving it there means every future launch re-renders the same broken
    // image and never reaches the network to replace it.
    clearCachedPhoto(playerId, pictureVersion)
      .catch(() => {})
      .then(() => reloadThumbnailUrl(playerId, pictureVersion))
      .then((url) => {
        if (url) setImgUrl(url);
      })
      .catch((err) => console.error("[PlayerAvatar] thumbnail downgrade after render failure also failed", playerId, err));
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const optimized = await compressImageToUnder1MB(file);
      const result = await Cr9be_playersService.upload(playerId, "cr9be_picture", optimized);
      if (result.success) {
        // Show it immediately rather than waiting on the parent refresh + a re-download —
        // the eventual pictureVersion update still runs the effect above, which reconciles
        // this with the canonical cached copy in the background.
        const preview = await blobToDataUrl(optimized);
        if (preview) setImgUrl(preview);
        onUploaded?.();
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRemoving(true);
    try {
      const result = await Cr9be_playersService.deleteFileOrImage(playerId, "cr9be_picture");
      if (result.success) {
        setImgUrl(null);
        clearCachedPhoto(playerId, pictureVersion).catch(() => {});
        onUploaded?.();
      }
    } finally {
      setRemoving(false);
    }
  };

  const showImage = !!imgUrl;
  const radius = size > 48 ? 16 : 12;
  const tapToEdit = editable && !showActions;

  const avatarCircle = (
    <div
      onClick={tapToEdit ? () => inputRef.current?.click() : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: COLORS.navy,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: displayStack,
        fontWeight: 800,
        fontSize: size * 0.31,
        position: "relative",
        flexShrink: 0,
        overflow: "hidden",
        cursor: tapToEdit ? "pointer" : "default",
      }}
    >
      {showImage ? (
        <img
          src={imgUrl}
          alt=""
          onError={handleImageRenderError}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        initials
      )}

      {tapToEdit && !hasPicture && (
        <span
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: Math.max(16, size * 0.42),
            height: Math.max(16, size * 0.42),
            borderRadius: 99,
            background: COLORS.yellow,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid #fff",
          }}
        >
          <Camera size={Math.max(8, size * 0.22)} color={COLORS.navy} strokeWidth={2.5} />
        </span>
      )}

      {(uploading || removing) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <RefreshCw size={size * 0.35} color="#fff" style={{ animation: "spin 1s linear infinite" }} />
        </div>
      )}

      {tapToEdit && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onClick={(e) => e.stopPropagation()}
          onChange={handleFileSelected}
          style={{ display: "none" }}
        />
      )}
    </div>
  );

  if (!showActions) return avatarCircle;

  const actionRowStyle: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "11px 14px",
    background: COLORS.cream,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 14,
    fontFamily: fontStack,
    fontSize: 13.5,
    fontWeight: 700,
    color: COLORS.navy,
    cursor: uploading || removing ? "not-allowed" : "pointer",
    opacity: uploading || removing ? 0.6 : 1,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {avatarCircle}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
        <button disabled={uploading || removing} onClick={() => cameraInputRef.current?.click()} style={actionRowStyle}>
          <Camera size={15} color={COLORS.navy} strokeWidth={2} />
          Take Photo
        </button>
        <button disabled={uploading || removing} onClick={() => galleryInputRef.current?.click()} style={actionRowStyle}>
          <ImageIcon size={15} color={COLORS.navy} strokeWidth={2} />
          Choose Photo
        </button>
        {hasPicture && (
          <button
            disabled={uploading || removing}
            onClick={handleRemovePhoto}
            style={{ ...actionRowStyle, background: "#FEE2E2", border: "1px solid #FCA5A5", color: "#DC2626" }}
          >
            <Trash2 size={15} color="#DC2626" strokeWidth={2} />
            Remove Photo
          </button>
        )}
      </div>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelected} style={{ display: "none" }} />
      <input ref={galleryInputRef} type="file" accept="image/*" onChange={handleFileSelected} style={{ display: "none" }} />
    </div>
  );
};
