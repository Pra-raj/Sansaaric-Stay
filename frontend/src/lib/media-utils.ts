/** Client-side checks for photo/video uploads. The backend must repeat them. */

export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const VIDEO_ACCEPT = "video/mp4,video/webm";

const PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const VIDEO_EXTENSIONS = ["mp4", "webm"];
const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_MIME_TYPES = ["video/mp4", "video/webm"];

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? "" : fileName.slice(index + 1).toLowerCase();
}

/** Returns an error message, or null when the photo can be uploaded. */
export function validatePhotoFile(file: File): string | null {
  const extension = extensionOf(file.name);
  if (!PHOTO_MIME_TYPES.includes(file.type) && !PHOTO_EXTENSIONS.includes(extension)) {
    return `${file.name}: choose a JPG, PNG or WebP image.`;
  }
  if (file.size === 0) return `${file.name}: the file is empty.`;
  if (file.size > PHOTO_MAX_BYTES) return `${file.name}: larger than 8 MB.`;
  return null;
}

/** Returns an error message, or null when the video can be uploaded. */
export function validateVideoFile(file: File): string | null {
  const extension = extensionOf(file.name);
  if (!VIDEO_MIME_TYPES.includes(file.type) && !VIDEO_EXTENSIONS.includes(extension)) {
    return `${file.name}: choose an MP4 or WebM video.`;
  }
  if (file.size === 0) return `${file.name}: the file is empty.`;
  if (file.size > VIDEO_MAX_BYTES) return `${file.name}: larger than 100 MB.`;
  return null;
}
