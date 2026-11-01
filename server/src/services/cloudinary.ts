import { v2 as cloudinary } from 'cloudinary';
import { HttpError } from '../http.js';

export type TrainerAssetKind = 'photo' | 'resume';

interface UploadedAsset {
  url: string;
  publicId: string;
}

function configureCloudinary(): void {
  const cloudName = process.env['CLOUDINARY_CLOUD_NAME'];
  const apiKey = process.env['CLOUDINARY_API_KEY'];
  const apiSecret = process.env['CLOUDINARY_API_SECRET'];
  if (!cloudName || !apiKey || !apiSecret) throw new HttpError(503, 'Profile uploads are not configured.');
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
}

export function uploadTrainerAsset(buffer: Buffer, userId: string, kind: TrainerAssetKind): Promise<UploadedAsset> {
  configureCloudinary();
  const photo = kind === 'photo';
  const publicId = `trainlead/trainers/${userId}/${kind}${photo ? '' : '.pdf'}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: photo ? 'image' : 'raw',
        overwrite: true,
        invalidate: true,
        ...(photo ? { transformation: [{ width: 256, height: 256, crop: 'fill', gravity: 'face', quality: 'auto', fetch_format: 'auto' }] } : {}),
      },
      (error, result) => {
        if (error || !result?.secure_url || !result.public_id) {
          reject(new HttpError(502, 'Cloudinary could not store this file.'));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}