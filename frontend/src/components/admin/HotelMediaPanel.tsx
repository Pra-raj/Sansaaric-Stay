"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Trash2, Upload, Video } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  deleteHotelPhoto,
  deleteHotelVideo,
  getHotelMedia,
  reorderHotelPhotos,
  uploadHotelPhoto,
  uploadHotelVideo,
} from "@/lib/api-client";
import {
  PHOTO_ACCEPT,
  VIDEO_ACCEPT,
  validatePhotoFile,
  validateVideoFile,
} from "@/lib/media-utils";
import type { HotelMediaApi } from "@/types";

interface PendingUpload {
  key: string;
  name: string;
  progress: number;
}

const dropzoneClass =
  "flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-ink-soft focus-within:border-brand-500";

/**
 * Photos & video for one hotel. Video needs a saved hotel id, so this panel is
 * only rendered on /admin/hotels/[id]. Upload endpoints may not exist yet; the
 * API layer turns 404/405/501 into a readable "not available yet" message.
 */
export function HotelMediaPanel({ hotelId }: { hotelId: string }) {
  const [media, setMedia] = useState<HotelMediaApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const [dragging, setDragging] = useState(false);
  const [photoUploads, setPhotoUploads] = useState<PendingUpload[]>([]);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [photoConfirm, setPhotoConfirm] = useState<string | null>(null);
  const [videoConfirm, setVideoConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getHotelMedia(hotelId)
      .then((next) => {
        if (!cancelled) setMedia(next);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load photos. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hotelId]);

  async function refresh() {
    try {
      const next = await getHotelMedia(hotelId);
      setMedia(next);
      setLoadError("");
    } catch {
      setLoadError("Couldn't load photos. Try again.");
    }
  }

  const photos = media?.photos ?? [];
  const video = media?.video ?? null;

  async function handlePhotoFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setActionError("");
    setNotice("");

    const accepted: File[] = [];
    const problems: string[] = [];
    for (const file of Array.from(fileList)) {
      const problem = validatePhotoFile(file);
      if (problem) problems.push(problem);
      else accepted.push(file);
    }
    if (problems.length > 0) setActionError(problems.join(" "));
    if (accepted.length === 0) return;

    setBusy(true);
    for (const file of accepted) {
      const key = `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`;
      setPhotoUploads((current) => [...current, { key, name: file.name, progress: 0 }]);
      try {
        await uploadHotelPhoto(hotelId, file, (progress) => {
          setPhotoUploads((current) =>
            current.map((item) => (item.key === key ? { ...item, progress } : item)),
          );
        });
        await refresh();
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Couldn't upload the photo. Try again.",
        );
      } finally {
        setPhotoUploads((current) => current.filter((item) => item.key !== key));
      }
    }
    setBusy(false);
  }

  async function removePhoto(photoId: string) {
    setActionError("");
    setNotice("");
    const previous = media;
    setMedia((current) =>
      current
        ? { ...current, photos: current.photos.filter((photo) => photo.id !== photoId) }
        : current,
    );
    setPhotoConfirm(null);
    try {
      await deleteHotelPhoto(hotelId, photoId);
      setNotice("Photo removed.");
      await refresh();
    } catch (err) {
      setMedia(previous);
      setActionError(err instanceof Error ? err.message : "Couldn't remove the photo. Try again.");
    }
  }

  async function movePhoto(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const reordered = [...photos];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    const previous = media;
    setActionError("");
    setNotice("");
    setMedia((current) => (current ? { ...current, photos: reordered } : current));
    try {
      await reorderHotelPhotos(
        hotelId,
        reordered.map((photo) => photo.id),
      );
    } catch (err) {
      setMedia(previous);
      setActionError(
        err instanceof Error ? err.message : "Couldn't reorder the photos. Try again.",
      );
    }
  }

  async function handleVideoFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setActionError("");
    setNotice("");
    const problem = validateVideoFile(file);
    if (problem) {
      setActionError(problem);
      return;
    }

    setBusy(true);
    setVideoProgress(0);
    try {
      await uploadHotelVideo(hotelId, file, setVideoProgress);
      setNotice("Video uploaded.");
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't upload the video. Try again.");
    } finally {
      setVideoProgress(null);
      setBusy(false);
    }
  }

  async function removeVideo() {
    setVideoConfirm(false);
    setActionError("");
    setNotice("");
    setBusy(true);
    try {
      await deleteHotelVideo(hotelId);
      setMedia((current) => (current ? { ...current, video: null } : current));
      setNotice("Video removed.");
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't remove the video. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!busy) void handlePhotoFiles(event.dataTransfer.files);
  }

  return (
    <section className="rounded-card border border-border/20 bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Photos &amp; video</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Photos: JPG, PNG or WebP up to 8 MB · Video: MP4 or WebM up to 100 MB.
          </p>
        </div>
      </div>

      {loadError && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {loadError}
        </p>
      )}
      {actionError && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {actionError}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm font-medium text-brand-600">
          {notice}
        </p>
      )}

      {loading ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="aspect-video" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Photos</h3>
              <span className="text-xs text-ink-soft">
                {photos.length} {photos.length === 1 ? "photo" : "photos"}
              </span>
            </div>

            <label
              htmlFor="hotel-photo-input"
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`${dropzoneClass} ${dragging ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : ""} ${
                busy ? "pointer-events-none opacity-60" : ""
              }`}
            >
              <Upload aria-hidden className="size-5 text-brand-600" />
              <span className="text-sm font-semibold">
                Drop photos here, or choose files
              </span>
              <span className="text-xs text-ink-soft">You can add several at once.</span>
              <input
                ref={photoInputRef}
                id="hotel-photo-input"
                type="file"
                accept={PHOTO_ACCEPT}
                multiple
                disabled={busy}
                onChange={(event) => {
                  void handlePhotoFiles(event.target.files);
                  event.target.value = "";
                }}
                className="sr-only"
              />
            </label>

            <div className="mt-3">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={busy}
                className="rounded-full border border-brand-500 px-3.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
              >
                Choose photos
              </button>
            </div>

            {photoUploads.length > 0 && (
              <ul className="mt-3 space-y-2">
                {photoUploads.map((upload) => (
                  <li key={upload.key} className="text-xs text-ink-soft">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">{upload.name}</span>
                      <span className="shrink-0 tabular-nums">{upload.progress}%</span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-ink/10"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={upload.progress}
                      aria-label={`Uploading ${upload.name}`}
                    >
                      <div
                        className="h-full rounded-full bg-brand-500 transition-[width] duration-200 motion-reduce:transition-none"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {photos.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-border py-6 text-center text-sm text-ink-soft">
                No photos yet.
              </p>
            ) : (
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((photo, index) => (
                  <li
                    key={photo.id}
                    className="overflow-hidden rounded-lg border border-border/60 bg-bg"
                  >
                    <div className="relative aspect-video bg-black/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={`Photo ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                      {index === 0 && (
                        <span className="absolute left-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          Cover
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 p-1.5">
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          onClick={() => void movePhoto(index, -1)}
                          disabled={index === 0 || busy}
                          aria-label={`Move photo ${index + 1} left`}
                          className="rounded p-1.5 text-ink-soft hover:bg-surface disabled:opacity-30"
                        >
                          <ChevronLeft aria-hidden className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void movePhoto(index, 1)}
                          disabled={index === photos.length - 1 || busy}
                          aria-label={`Move photo ${index + 1} right`}
                          className="rounded p-1.5 text-ink-soft hover:bg-surface disabled:opacity-30"
                        >
                          <ChevronRight aria-hidden className="size-4" />
                        </button>
                      </div>
                      {photoConfirm === photo.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void removePhoto(photo.id)}
                            className="rounded px-1.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-surface"
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={() => setPhotoConfirm(null)}
                            className="rounded px-1.5 py-1 text-[11px] font-semibold text-ink-soft hover:bg-surface"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPhotoConfirm(photo.id)}
                          disabled={busy}
                          aria-label={`Remove photo ${index + 1}`}
                          className="rounded p-1.5 text-ink-soft hover:bg-surface hover:text-red-600 disabled:opacity-30"
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold">Video</h3>

            {video ? (
              <div className="space-y-2">
                <video
                  src={video.url}
                  poster={video.posterUrl}
                  controls
                  playsInline
                  className="aspect-video w-full max-w-md rounded-lg bg-black"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={busy}
                    className="rounded-full border border-brand-500 px-3.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                  >
                    Replace video
                  </button>
                  {videoConfirm ? (
                    <>
                      <span className="text-xs text-ink-soft">
                        Remove this video? This cannot be undone.
                      </span>
                      <button
                        type="button"
                        onClick={() => void removeVideo()}
                        disabled={busy}
                        className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Yes, remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoConfirm(false)}
                        disabled={busy}
                        className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-bg disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setVideoConfirm(true)}
                      disabled={busy}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-bg hover:text-red-600 disabled:opacity-50"
                    >
                      Remove video
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <label
                  htmlFor="hotel-video-input"
                  className={`${dropzoneClass} ${busy ? "pointer-events-none opacity-60" : ""}`}
                >
                  <Video aria-hidden className="size-5 text-brand-600" />
                  <span className="text-sm font-semibold">Add a short video</span>
                  <span className="text-xs text-ink-soft">MP4 or WebM up to 100 MB.</span>
                </label>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={busy}
                    className="rounded-full border border-brand-500 px-3.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                  >
                    Choose video
                  </button>
                </div>
              </>
            )}

            <input
              ref={videoInputRef}
              id="hotel-video-input"
              type="file"
              accept={VIDEO_ACCEPT}
              disabled={busy}
              onChange={(event) => {
                void handleVideoFile(event.target.files);
                event.target.value = "";
              }}
              className="sr-only"
            />

            {videoProgress !== null && (
              <div className="mt-3 text-xs text-ink-soft">
                <div className="mb-1 flex items-center justify-between">
                  <span>Uploading video…</span>
                  <span className="tabular-nums">{videoProgress}%</span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-ink/10"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={videoProgress}
                  aria-label="Uploading video"
                >
                  <div
                    className="h-full rounded-full bg-brand-500 transition-[width] duration-200 motion-reduce:transition-none"
                    style={{ width: `${videoProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <p className="mt-5 flex items-center gap-1.5 text-xs text-ink-soft">
        <ImagePlus aria-hidden className="size-3.5" />
        The first photo is used as the cover.
      </p>
    </section>
  );
}

export default HotelMediaPanel;
