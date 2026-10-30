// Browser-side image preparation for profile pictures and the insight photo:
// validates the file, then downsizes and re-encodes it so uploads stay small.

export const DEFAULT_AVATAR = '/img/cat-sea.webp';
export const DEFAULT_INSIGHT_IMAGE = '/img/cat-daisies.webp';

export type ImageSlot = 'avatar' | 'insight';

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Longest edge in pixels per slot. Avatars are cropped square. */
const SIZE: Record<ImageSlot, number> = { avatar: 256, insight: 1200 };

/** Returns an error message, or null when the file can be used. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!ACCEPTED.includes(file.type)) return 'Choose a PNG, JPEG, WebP or GIF image.';
  if (file.size > MAX_INPUT_BYTES) return 'That image is larger than 10 MB.';
  return null;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

/** Downsize (and for avatars, center-crop to a square) and encode as WebP. */
export async function prepareImage(file: File, slot: ImageSlot): Promise<Blob> {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);

  const img = await loadImage(file);
  const max = SIZE[slot];
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (slot === 'avatar') {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2;
    sy = (sh - side) / 2;
    sw = sh = side;
  }
  const scale = Math.min(1, max / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot process images here.');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode that image.'))),
      'image/webp',
      0.85,
    ),
  );
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(blob);
  });
}
