import React, { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, RefreshCw, Trash2 } from "lucide-react";
import { COLORS, displayStack, fontStack } from "../../constants/design";
import { Cr9be_playersService } from "../../generated/services/Cr9be_playersService";
import { blobToDataUrl, compressImageToUnder1MB } from "../../utils/image";
import { clearCachedPhoto, loadPlayerPhotoUrl, reloadThumbnailUrl } from "../../utils/photoCache";

const PICTURE_COLUMN = "cr9be_picture";

interface PlayerAvatarProps {
  playerId: string;
  hasPicture: boolean;
  initials: string;
  size?: number;
  pictureVersion?: number;
  editable?: boolean;
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
  const triedThumbnailFallbackRef = useRef(false);

  useEffect(() => {
    triedThumbnailFallbackRef.current = false;
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

  const fallBackToThumbnail = () => {
    setImgUrl(null);
    if (triedThumbnailFallbackRef.current) return;
    triedThumbnailFallbackRef.current = true;
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
      const result = await Cr9be_playersService.upload(playerId, PICTURE_COLUMN, optimized);
      if (result.success) {
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
      const result = await Cr9be_playersService.deleteFileOrImage(playerId, PICTURE_COLUMN);
      if (result.success) {
        setImgUrl(null);
        clearCachedPhoto(playerId, pictureVersion).catch(() => {});
        onUploaded?.();
      }
    } finally {
      setRemoving(false);
    }
  };

  const isBusy = uploading || removing;
  const borderRadius = size > 48 ? 16 : 12;
  const tapToEdit = editable && !showActions;

  const avatarCircle = (
    <div
      onClick={tapToEdit ? () => inputRef.current?.click() : undefined}
      style={{
        width: size,
        height: size,
        borderRadius,
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
      {imgUrl ? (
        <img
          src={imgUrl}
          alt=""
          onError={fallBackToThumbnail}
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

      {isBusy && (
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
    cursor: isBusy ? "not-allowed" : "pointer",
    opacity: isBusy ? 0.6 : 1,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {avatarCircle}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
        <button disabled={isBusy} onClick={() => cameraInputRef.current?.click()} style={actionRowStyle}>
          <Camera size={15} color={COLORS.navy} strokeWidth={2} />
          Take Photo
        </button>
        <button disabled={isBusy} onClick={() => galleryInputRef.current?.click()} style={actionRowStyle}>
          <ImageIcon size={15} color={COLORS.navy} strokeWidth={2} />
          Choose Photo
        </button>
        {hasPicture && (
          <button
            disabled={isBusy}
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
