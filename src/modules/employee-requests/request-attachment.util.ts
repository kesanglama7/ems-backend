import { BadRequestException } from '@nestjs/common';
export const MAX_REQUEST_ATTACHMENTS = 10;
export const MAX_REQUEST_ATTACHMENT_SIZE = 5 * 1024 * 1024;
export function validateRequestImage(file: Express.Multer.File): string {
  if (!file.buffer || !file.size || file.size > MAX_REQUEST_ATTACHMENT_SIZE)
    throw new BadRequestException(
      'Each bill photo must be between 1 byte and 5 MB.',
    );
  const b = file.buffer;
  const png =
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255;
  const webp =
    b.length >= 12 &&
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WEBP';
  if (file.mimetype === 'image/png' && png) return 'png';
  if (file.mimetype === 'image/jpeg' && jpeg) return 'jpg';
  if (file.mimetype === 'image/webp' && webp) return 'webp';
  throw new BadRequestException(
    'Only valid JPEG, PNG or WebP bill photos are allowed.',
  );
}
