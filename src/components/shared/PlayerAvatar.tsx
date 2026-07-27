import React, { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";
import { COLORS, displayStack } from "../../constants/design";
import { Cr9be_playersService } from "../../generated/services/Cr9be_playersService";
import { compressImageToUnder1MB } from "../../utils/image";

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
  onUploaded?: () => void;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  playerId,
  hasPicture,
  initials,
  size = 42,
  pictureVersion,
  editable = false,
  onUploaded,
}) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasPicture) {
      setImgUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    // fullSize: true — the thumbnail rendition Dataverse generates is server-side
    // center-cropped to a square, which is what was causing the "zoomed in" look
    // no CSS objectFit could fix. Full size is cheap here since uploads are already
    // compressed to under 1MB client-side.
    Cr9be_playersService.downloadImage(playerId, "cr9be_picture", true)
      .then((res) => {
        if (cancelled || !res.success || !res.data || res.data.length === 0) return;
        const blob = new Blob([res.data as BlobPart], { type: "image/jpeg" });
        objectUrl = URL.createObjectURL(blob);
        setImgUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [playerId, hasPicture, pictureVersion]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const optimized = await compressImageToUnder1MB(file);
      const result = await Cr9be_playersService.upload(playerId, "cr9be_picture", optimized);
      if (result.success) onUploaded?.();
    } finally {
      setUploading(false);
    }
  };

  const showImage = !!imgUrl;
  const radius = size > 48 ? 16 : 12;

  return (
    <div
      onClick={editable ? () => inputRef.current?.click() : undefined}
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
        cursor: editable ? "pointer" : "default",
      }}
    >
      {showImage ? (
        <img
          src={imgUrl}
          alt=""
          onError={() => setImgUrl(null)}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        initials
      )}

      {editable && !showImage && (
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

      {uploading && (
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

      {editable && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onClick={(e) => e.stopPropagation()}
          onChange={handleFileSelected}
          style={{ display: "none" }}
        />
      )}
    </div>
  );
};
