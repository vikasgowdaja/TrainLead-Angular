import { Router, type RequestHandler } from 'express';
import multer, { type FileFilterCallback } from 'multer';
import { TrainerProfileUpdateSchema } from '@trainlead/shared';
import type { PublicTrainerProfileView, TrainerProfileSuggestions, TrainerProfileView } from '@trainlead/shared/domain';
import { actorOf, loadActor } from '../auth/actor.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError, objectId, parseBody } from '../http.js';
import { User } from '../models/user.js';
import { uploadTrainerAsset, type TrainerAssetKind } from '../services/cloudinary.js';
import { extractTrainerProfileFromResume } from '../services/resume-extraction.js';

const router = Router();
router.get('/:id/public', async (request, response) => {
  const identifier = request.params['id'].trim().toLowerCase();
  const lookup = /^[a-f0-9]{24}$/i.test(identifier)
    ? { _id: objectId(identifier, 'trainer id') }
    : { publicSlug: identifier };
  const trainer = await User.findOne({ ...lookup, role: 'Trainer', isPublic: true, deletedAt: null } as never)
    .select('name publicSlug photoUrl location skills githubUrl linkedinUrl leetcodeUrl bio portfolioItems certifications')
    .lean();
  if (!trainer) throw new HttpError(404, 'Public trainer profile not found.');
  const data: PublicTrainerProfileView = {
    id: String(trainer._id),
    publicSlug: trainer.publicSlug ?? String(trainer._id),
    name: trainer.name,
    photoUrl: trainer.photoUrl ?? null,
    location: trainer.location ?? '',
    skills: trainer.skills ?? [],
    githubUrl: trainer.githubUrl ?? null,
    linkedinUrl: trainer.linkedinUrl ?? null,
    leetcodeUrl: trainer.leetcodeUrl ?? null,
    bio: trainer.bio ?? '',
    portfolioItems: (trainer.portfolioItems ?? []).map((item) => ({
      title: item.title,
      description: item.description ?? '',
      imageUrl: item.imageUrl ?? null,
      videoUrl: item.videoUrl ?? null,
      projectUrl: item.projectUrl ?? null,
    })),
    certifications: (trainer.certifications ?? []).map((credential) => ({
      name: credential.name,
      issuer: credential.issuer ?? '',
      issuedDate: credential.issuedDate ?? null,
      credentialUrl: credential.credentialUrl,
    })),
  };
  response.json({ data });
});

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

function presentProfile(user: { _id: unknown; name: string; email?: string | null; phone?: string | null; photoUrl?: string | null; resumeUrl?: string | null; resumeFileName?: string | null; location?: string; skills?: string[]; expectedRate?: number | null; githubUrl?: string | null; linkedinUrl?: string | null; leetcodeUrl?: string | null; bio?: string; portfolioItems?: { title: string; description?: string; imageUrl?: string | null; videoUrl?: string | null; projectUrl?: string | null }[]; certifications?: { name: string; issuer?: string; issuedDate?: string | null; credentialUrl: string }[]; isPublic?: boolean; publicSlug?: string | null }): TrainerProfileView {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email ?? null,
    phone: user.phone ?? null,
    photoUrl: user.photoUrl ?? null,
    resumeUrl: user.resumeUrl ?? null,
    resumeFileName: user.resumeFileName ?? null,
    location: user.location ?? '',
    skills: user.skills ?? [],
    expectedRate: user.expectedRate ?? null,
    githubUrl: user.githubUrl ?? null,
    linkedinUrl: user.linkedinUrl ?? null,
    leetcodeUrl: user.leetcodeUrl ?? null,
    bio: user.bio ?? '',
    portfolioItems: (user.portfolioItems ?? []).map((item) => ({
      title: item.title,
      description: item.description ?? '',
      imageUrl: item.imageUrl ?? null,
      videoUrl: item.videoUrl ?? null,
      projectUrl: item.projectUrl ?? null,
    })),
    certifications: (user.certifications ?? []).map((credential) => ({
      name: credential.name,
      issuer: credential.issuer ?? '',
      issuedDate: credential.issuedDate ?? null,
      credentialUrl: credential.credentialUrl,
    })),
    isPublic: user.isPublic ?? false,
    publicSlug: user.publicSlug ?? null,
  };
}

router.get('/me', async (request, response) => {
  const actor = actorOf(request);
  const user = await User.findOne({ _id: actor.userId, deletedAt: null }).select('name email phone photoUrl resumeUrl resumeFileName location skills expectedRate githubUrl linkedinUrl leetcodeUrl bio portfolioItems certifications isPublic publicSlug').lean();
  if (!user) throw new HttpError(404, 'Trainer profile not found.');
  response.json({ data: presentProfile(user) });
});

router.put('/me', async (request, response) => {
  const actor = actorOf(request);
  const input = parseBody(TrainerProfileUpdateSchema, request.body, 'trainer profile');
  try {
    const current = await User.findOne({ _id: actor.userId, role: 'Trainer', deletedAt: null } as never).select('publicSlug').lean();
    if (!current) throw new HttpError(404, 'Trainer profile not found.');
    let publicSlug = current.publicSlug ?? null;
    if (input.isPublic && !publicSlug) {
      const base = input.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40) || 'trainer';
      const collision = await User.exists({ publicSlug: base, _id: { $ne: actor.userId }, deletedAt: null } as never);
      publicSlug = collision ? `${base}-${String(actor.userId).slice(-6)}` : base;
    }
    const user = await User.findOneAndUpdate(
      { _id: actor.userId, role: 'Trainer', deletedAt: null } as never,
      { $set: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        location: input.location ?? '',
        skills: input.skills,
        expectedRate: input.expectedRate,
        githubUrl: input.githubUrl,
        linkedinUrl: input.linkedinUrl,
        leetcodeUrl: input.leetcodeUrl,
        bio: input.bio,
        portfolioItems: input.portfolioItems,
        certifications: input.certifications,
        isPublic: input.isPublic,
        publicSlug,
      } },
      { new: true, runValidators: true },
    ).select('name email phone photoUrl resumeUrl resumeFileName location skills expectedRate githubUrl linkedinUrl leetcodeUrl bio portfolioItems certifications isPublic publicSlug');
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
      : {
          resumeUrl: asset.url,
          resumePublicId: asset.publicId,
          resumeFileName: file.originalname.replace(/\\/g, '/').split('/').pop()?.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) || 'resume.pdf',
        };
    const user = await User.findOneAndUpdate(
      { _id: actor.userId, role: 'Trainer', deletedAt: null } as never,
      { $set: fields },
      { new: true },
    ).select('name email phone photoUrl resumeUrl resumeFileName location skills expectedRate githubUrl linkedinUrl leetcodeUrl bio portfolioItems certifications isPublic');
    if (!user) throw new HttpError(404, 'Trainer profile not found.');
    response.json({ data: presentProfile(user.toObject()) });
  }];
}

router.post('/me/resume/extract', parseUpload('resume'), async (request, response) => {
  const file = request.file;
  if (!file) throw new HttpError(400, 'Choose a PDF resume first.');
  if (!validFileSignature(file, 'resume')) throw new HttpError(415, 'The file contents are not a valid PDF.');
  try {
    response.json({ data: await extractTrainerProfileFromResume(file.buffer) });
  } catch {
    throw new HttpError(422, 'Could not extract readable text from this PDF. You can still enter your profile details manually.');
  }
});

router.post('/me/photo', ...uploadRoute('photo'));
router.post('/me/resume', ...uploadRoute('resume'));

export { router as trainerProfileRouter };