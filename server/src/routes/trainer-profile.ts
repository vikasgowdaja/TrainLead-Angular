import { Router, type RequestHandler } from 'express';
import multer, { type FileFilterCallback } from 'multer';
import { TrainerProfileUpdateSchema } from '@trainlead/shared';
import type { TrainerProfileView } from '@trainlead/shared/domain';
import { actorOf, loadActor } from '../auth/actor.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError, parseBody } from '../http.js';
import { User } from '../models/user.js';
import { uploadTrainerAsset, type TrainerAssetKind } from '../services/cloudinary.js';

const router = Router();
router.use(requireAuth, requireRole('Trainer'), loadActor);

function parseUpload(kind: TrainerAssetKind): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: kind === 'photo' ? 1024 * 1024 : 3 * 1024 * 1024, files: 1 },
    fileFilter(_request, file, callback: FileFilterCallback) {
      const supported = kind === 'photo'
        ? ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
        : file.mimetype === 'application/pdf';
      if (!supported) {
        callback(new HttpError(415, 'Upload a JPEG, PNG, or WebP photo, or a PDF resume.'));
        return;
      }
      callback(null, true);
    },
  });
  return (request, response, next) => {
    upload.single(kind)(request, response, (error: unknown) => {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(new HttpError(413, kind === 'photo' ? 'Profile photo must be 1 MB or smaller.' : 'Resume must be 3 MB or smaller.'));
        return;
      }
      next(error);
    });
  };
}

function validFileSignature(file: Express.Multer.File, kind: TrainerAssetKind): boolean {
  if (kind === 'resume') return file.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (file.mimetype === 'image/jpeg') return file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
  if (file.mimetype === 'image/png') return file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return file.mimetype === 'image/webp' && file.buffer.toString('ascii', 0, 4) === 'RIFF' && file.buffer.toString('ascii', 8, 12) === 'WEBP';
}

function presentProfile(user: { _id: unknown; name: string; email?: string | null; phone?: string | null; photoUrl?: string | null; resumeUrl?: string | null }): TrainerProfileView {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email ?? null,
    phone: user.phone ?? null,
    photoUrl: user.photoUrl ?? null,
    resumeUrl: user.resumeUrl ?? null,
  };
}

router.get('/me', async (request, response) => {
  const actor = actorOf(request);
  const user = await User.findOne({ _id: actor.userId, deletedAt: null }).select('name email phone photoUrl resumeUrl').lean();
  if (!user) throw new HttpError(404, 'Trainer profile not found.');
  response.json({ data: presentProfile(user) });
});

router.put('/me', async (request, response) => {
  const actor = actorOf(request);
  const input = parseBody(TrainerProfileUpdateSchema, request.body, 'trainer profile');
  try {
    const user = await User.findOneAndUpdate(
      { _id: actor.userId, role: 'Trainer', deletedAt: null } as never,
      { $set: { name: input.name, email: input.email, phone: input.phone } },
      { new: true, runValidators: true },
    ).select('name email phone photoUrl resumeUrl');
    if (!user) throw new HttpError(404, 'Trainer profile not found.');
    response.json({ data: presentProfile(user.toObject()) });
  } catch (error) {
    if (typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000) {
      throw new HttpError(409, 'That email or phone number is already in use.');
    }
    throw error;
  }
});

function uploadRoute(kind: TrainerAssetKind): RequestHandler[] {
  return [parseUpload(kind), async (request, response) => {
    const actor = actorOf(request);
    const file = request.file;
    if (!file) throw new HttpError(400, `Choose a ${kind === 'photo' ? 'profile photo' : 'PDF resume'} first.`);
    const maxSize = kind === 'photo' ? 1024 * 1024 : 3 * 1024 * 1024;
    if (file.size > maxSize) throw new HttpError(413, kind === 'photo' ? 'Profile photo must be 1 MB or smaller.' : 'Resume must be 3 MB or smaller.');
    if (!validFileSignature(file, kind)) throw new HttpError(415, 'The file contents do not match the selected file type.');
    const asset = await uploadTrainerAsset(file.buffer, String(actor.userId), kind);
    const fields = kind === 'photo'
      ? { photoUrl: asset.url, photoPublicId: asset.publicId }
      : { resumeUrl: asset.url, resumePublicId: asset.publicId };
    const user = await User.findOneAndUpdate(
      { _id: actor.userId, role: 'Trainer', deletedAt: null } as never,
      { $set: fields },
      { new: true },
    ).select('name email phone photoUrl resumeUrl');
    if (!user) throw new HttpError(404, 'Trainer profile not found.');
    response.json({ data: presentProfile(user.toObject()) });
  }];
}

router.post('/me/photo', ...uploadRoute('photo'));
router.post('/me/resume', ...uploadRoute('resume'));

export { router as trainerProfileRouter };