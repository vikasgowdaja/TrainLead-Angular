import { Router } from 'express';
import { ApplicationDecisionSchema, ApplyToRequirementSchema, BookDemoSlotSchema, InterviewScheduleSchema, TrainerProjectReviewSchema } from '@trainlead/shared';
import type { ApplicationNotificationView, ApplicationStatus, ApplicationView, TrainerNotificationView } from '@trainlead/shared/domain';
import { Types } from 'mongoose';
import { actorOf, loadActor, requireOrganization } from '../auth/actor.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError, notFound, objectId, parseBody } from '../http.js';
import { Application } from '../models/application.js';
import { Notification } from '../models/notification.js';
import { Requirement } from '../models/requirement.js';
import { User } from '../models/user.js';
import { canManageRequirement } from '../services/access.js';
import { notifyTrainerOfApplicationUpdate } from '../services/trainer-notifications.js';
import { withTransaction } from '../database.js';

const router = Router();
router.use(requireAuth);

interface PopulatedUser {
  _id: Types.ObjectId;
  name: string;
  email?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  publicSlug?: string | null;
  isPublic?: boolean;
}

interface PopulatedRequirement {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  title: string;
  city: string;
  startDate: Date;
  endDate: Date;
}

interface ApplicationRecord {
  _id: Types.ObjectId;
  requirementId: Types.ObjectId | PopulatedRequirement;
  organizationId: Types.ObjectId;
  trainerId: Types.ObjectId | PopulatedUser;
  coverNote: string;
  expectedRate: number | null;
  skills: string[];
  location: string;
  contactPhone: string;
  resumeUrl: string;
  githubUrl: string;
  linkedinUrl: string;
  leetcodeUrl: string;
  status: ApplicationStatus;
  interviewProvider: ApplicationView['interview'] extends infer _T ? string | null : never;
  meetingUrl: string | null;
  interviewAt: Date | null;
  interviewNotes: string;
  demoSlotAt: Date | null;
  decisionNote: string | null;
  trainerRating: number | null;
  trainerReview: string | null;
  canManage: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function isPopulatedUser(value: ApplicationRecord['trainerId']): value is PopulatedUser {
  return typeof value === 'object' && 'name' in value;
}

function isPopulatedRequirement(value: ApplicationRecord['requirementId']): value is PopulatedRequirement {
  return typeof value === 'object' && 'title' in value;
}

function presentApplication(application: ApplicationRecord, includeTrainerContact: boolean, canManage: boolean): ApplicationView {
  const trainer = isPopulatedUser(application.trainerId) ? application.trainerId : null;
  const requirement = isPopulatedRequirement(application.requirementId) ? application.requirementId : null;
  const showContact = includeTrainerContact || canManage || application.status === 'Accepted';
  return {
    id: String(application._id),
    requirement: {
      id: String(requirement?._id ?? application.requirementId),
      title: requirement?.title ?? '',
      city: requirement?.city ?? '',
      startDate: requirement?.startDate.toISOString().slice(0, 10) ?? '',
      endDate: requirement?.endDate.toISOString().slice(0, 10) ?? '',
    },
    trainer: {
      id: String(trainer?._id ?? application.trainerId),
      name: trainer?.name ?? 'Trainer',
      photoUrl: trainer?.photoUrl ?? null,
      publicSlug: trainer?.isPublic ? trainer.publicSlug ?? String(trainer._id) : null,
      skills: application.skills ?? [],
      location: application.location ?? '',
      email: showContact ? trainer?.email ?? null : null,
      phone: showContact ? application.contactPhone || trainer?.phone || null : null,
      profileLinks: {
        resume: application.resumeUrl ?? '',
        github: application.githubUrl ?? '',
        linkedin: application.linkedinUrl ?? '',
        leetcode: application.leetcodeUrl ?? '',
      },
    },
    coverNote: application.coverNote,
    expectedRate: application.expectedRate,
    status: application.status,
    interview: application.interviewProvider && application.meetingUrl && application.interviewAt
      ? {
          provider: application.interviewProvider as NonNullable<ApplicationView['interview']>['provider'],
          meetingUrl: application.meetingUrl,
          scheduledAt: application.interviewAt.toISOString(),
          notes: application.interviewNotes,
        }
      : null,
    decisionNote: application.decisionNote,
    trainerRating: application.trainerRating ?? null,
    trainerReview: application.trainerReview ?? null,
    canManage,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
  };
}

function duplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

router.get('/mine', requireRole('Trainer'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const applications = await Application.find({ trainerId: actor.userId, deletedAt: null } as never)
    .populate('trainerId', 'name email phone photoUrl')
    .populate('requirementId', 'title city startDate endDate')
    .sort({ createdAt: -1 })
    .lean();
  response.json({ data: applications.map((application) => presentApplication(application as unknown as ApplicationRecord, true, false)) });
});

router.get('/notifications', requireRole('Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const organizationId = requireOrganization(actor);
  const filter = { organizationId, deletedAt: null };
  const [applications, pendingCount] = await Promise.all([
    Application.find(filter as never)
      .populate('trainerId', 'name')
      .populate('requirementId', 'title')
      .sort({ updatedAt: -1 })
      .limit(12)
      .lean(),
    Application.countDocuments({ ...filter, status: 'Applied' } as never),
  ]);
  const data: ApplicationNotificationView[] = applications.map((raw) => {
    const application = raw as unknown as ApplicationRecord;
    const requirement = isPopulatedRequirement(application.requirementId) ? application.requirementId : null;
    const trainer = isPopulatedUser(application.trainerId) ? application.trainerId : null;
    return {
      applicationId: String(application._id),
      requirementId: String(requirement?._id ?? application.requirementId),
      requirementTitle: requirement?.title ?? 'Requirement',
      trainerName: trainer?.name ?? 'Trainer',
      status: application.status,
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
    };
  });
  response.json({ data, pendingCount });
});

router.get('/trainer/notifications', requireRole('Trainer'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const filter = { recipientId: actor.userId };
  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter as never).sort({ createdAt: -1 }).limit(30).lean(),
    Notification.countDocuments({ ...filter, readAt: null } as never),
  ]);
  const data: TrainerNotificationView[] = notifications.map((notification) => ({
    id: String(notification['_id']),
    kind: notification['kind'] as TrainerNotificationView['kind'],
    requirementId: String(notification['requirementId']),
    applicationId: notification['applicationId'] ? String(notification['applicationId']) : null,
    title: String(notification['title']),
    message: String(notification['message']),
    createdAt: (notification['createdAt'] as Date).toISOString(),
    readAt: notification['readAt'] ? (notification['readAt'] as Date).toISOString() : null,
  }));
  response.json({ data, unreadCount });
});

router.patch('/trainer/notifications/:notificationId/read', requireRole('Trainer'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const notificationId = objectId(request.params['notificationId'], 'notification id');
  const notification = await Notification.findOne({ _id: notificationId, recipientId: actor.userId } as never);
  if (!notification) throw notFound('Notification');
  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }
  response.json({ data: { id: String(notification._id), readAt: notification.readAt.toISOString() } });
});

router.get('/requirements/:requirementId/mine', requireRole('Trainer'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const requirementId = objectId(request.params['requirementId'], 'requirement id');
  const application = await Application.findOne({ requirementId, trainerId: actor.userId, deletedAt: null } as never)
    .populate('trainerId', 'name email phone photoUrl')
    .populate('requirementId', 'title city startDate endDate');
  response.json({ data: application ? presentApplication(application.toObject() as unknown as ApplicationRecord, true, false) : null });
});

router.post('/requirements/:requirementId', requireRole('Trainer'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const requirementId = objectId(request.params['requirementId'], 'requirement id');
  const requirement = await Requirement.findOne({ _id: requirementId, deletedAt: null, status: 'Open' } as never);
  if (!requirement) throw notFound('Open requirement');
  if (requirement.organizationId.equals(actor.organizationId ?? undefined)) {
    throw new HttpError(403, 'You cannot apply to your own organization’s requirement');
  }
  const input = parseBody(ApplyToRequirementSchema, request.body, 'application');
  const applicationFields = {
    organizationId: requirement.organizationId,
    coverNote: input.coverNote,
    expectedRate: input.expectedRate,
    skills: input.skills,
    location: input.location,
    contactPhone: input.contactPhone,
    resumeUrl: input.resumeUrl,
    githubUrl: input.githubUrl,
    linkedinUrl: input.linkedinUrl,
    leetcodeUrl: input.leetcodeUrl,
    status: 'Applied' as const,
    interviewProvider: null,
    meetingUrl: null,
    interviewAt: null,
    interviewNotes: '',
    demoSlotAt: null,
    decisionNote: null,
  };
  const rejectedApplication = await Application.findOneAndUpdate(
    { requirementId, trainerId: actor.userId, status: 'Rejected', deletedAt: null } as never,
    { $set: applicationFields },
    { new: true, runValidators: true },
  );
  if (rejectedApplication) {
    await rejectedApplication.populate([
      { path: 'trainerId', select: 'name email phone photoUrl' },
      { path: 'requirementId', select: 'title city startDate endDate' },
    ]);
    response.json({ data: presentApplication(rejectedApplication.toObject() as unknown as ApplicationRecord, true, false) });
    return;
  }
  try {
    const application = await Application.create({
      requirementId,
      trainerId: actor.userId,
      ...applicationFields,
    });
    await application.populate([
      { path: 'trainerId', select: 'name email phone photoUrl' },
      { path: 'requirementId', select: 'title city startDate endDate' },
    ]);
    response.status(201).json({ data: presentApplication(application.toObject() as unknown as ApplicationRecord, true, false) });
  } catch (error) {
    if (duplicateKey(error)) throw new HttpError(409, 'You have already applied to this requirement');
    throw error;
  }
});

router.get('/requirements/:requirementId', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const requirementId = objectId(request.params['requirementId'], 'requirement id');
  const requirement = await Requirement.findOne({ _id: requirementId, deletedAt: null } as never).lean();
  if (!requirement) throw notFound('Requirement');
  if (!canManageRequirement(actor, requirement as unknown as { organizationId: Types.ObjectId })) {
    throw new HttpError(403, 'Only the posting organization can review applications');
  }
  const applications = await Application.find({ requirementId, deletedAt: null } as never)
    .populate('trainerId', 'name email phone photoUrl publicSlug isPublic')
    .populate('requirementId', 'title city startDate endDate')
    .sort({ createdAt: -1 })
    .lean();
  response.json({ data: applications.map((application) => presentApplication(application as unknown as ApplicationRecord, false, true)) });
});

router.patch('/:applicationId/interview', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const applicationId = objectId(request.params['applicationId'], 'application id');
  const input = parseBody(InterviewScheduleSchema, request.body, 'interview schedule');
  const application = await Application.findOne({ _id: applicationId, deletedAt: null } as never);
  if (!application) throw notFound('Application');
  const requirement = await Requirement.findOne({ _id: application.requirementId, deletedAt: null } as never).lean();
  if (!requirement) throw notFound('Requirement');
  if (!canManageRequirement(actor, requirement as unknown as { organizationId: Types.ObjectId })) {
    throw new HttpError(403, 'Only the posting organization can schedule an interview');
  }
  if (application.status !== 'Applied' && application.status !== 'InterviewScheduled') {
    throw new HttpError(409, 'Interviews can only be scheduled for active applications');
  }
  const scheduledAt = new Date(input.scheduledAt);
  if (scheduledAt <= new Date()) throw new HttpError(400, 'Interview time must be in the future');
  application.set({
    interviewProvider: input.provider,
    meetingUrl: input.meetingUrl,
    interviewAt: scheduledAt,
    interviewNotes: input.notes,
    demoSlotAt: null,
    status: 'InterviewScheduled',
  });
  await withTransaction(async (session) => {
    await application.save(session ? { session } : undefined);
    await notifyTrainerOfApplicationUpdate({
      recipientId: application.trainerId as Types.ObjectId,
      kind: 'ApplicationUpdate',
      requirementId: requirement._id,
      applicationId: application._id,
      title: 'Interview scheduled',
      message: `Your interview is scheduled for ${scheduledAt.toISOString()}.`,
    }, session);
  });
  await application.populate([
    { path: 'trainerId', select: 'name email phone photoUrl' },
    { path: 'requirementId', select: 'title city startDate endDate' },
  ]);
  response.json({ data: presentApplication(application.toObject() as unknown as ApplicationRecord, false, true) });
});

router.patch('/:applicationId/demo-slot', requireRole('Trainer'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const applicationId = objectId(request.params['applicationId'], 'application id');
  const { scheduledAt: scheduledAtInput } = parseBody(BookDemoSlotSchema, request.body, 'demo slot');
  const application = await Application.findOne({ _id: applicationId, trainerId: actor.userId, status: 'Applied', demoSlotAt: null, deletedAt: null } as never);
  if (!application) throw new HttpError(409, 'This application is no longer available for demo-slot booking');
  const requirement = await Requirement.findOne({ _id: application.requirementId, deletedAt: null } as never);
  if (!requirement) throw notFound('Requirement');
  const scheduledAt = new Date(scheduledAtInput);
  if (scheduledAt <= new Date()) throw new HttpError(400, 'Demo slot must be in the future');
  const slot = requirement.demoSlots.find((item) => item.scheduledAt.getTime() === scheduledAt.getTime());
  if (!slot) throw new HttpError(409, 'That demo slot is no longer offered');
  try {
    application.set({
      demoSlotAt: scheduledAt,
      interviewProvider: slot.provider,
      meetingUrl: slot.meetingUrl,
      interviewAt: scheduledAt,
      interviewNotes: '',
      status: 'InterviewScheduled',
    });
    await application.save();
  } catch (error) {
    if (duplicateKey(error)) throw new HttpError(409, 'That demo slot has just been booked by another trainer');
    throw error;
  }
  await application.populate([
    { path: 'trainerId', select: 'name email phone photoUrl' },
    { path: 'requirementId', select: 'title city startDate endDate' },
  ]);
  response.json({ data: presentApplication(application.toObject() as unknown as ApplicationRecord, true, false) });
});

router.patch('/:applicationId/decision', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const applicationId = objectId(request.params['applicationId'], 'application id');
  const input = parseBody(ApplicationDecisionSchema, request.body, 'application decision');
  const application = await Application.findOne({ _id: applicationId, deletedAt: null } as never);
  if (!application) throw notFound('Application');
  const requirement = await Requirement.findOne({ _id: application.requirementId, deletedAt: null } as never).lean();
  if (!requirement) throw notFound('Requirement');
  if (!canManageRequirement(actor, requirement as unknown as { organizationId: Types.ObjectId })) {
    throw new HttpError(403, 'Only the posting organization can decide this application');
  }
  if (!['InterviewScheduled', 'OnHold'].includes(application.status) && input.status === 'Accepted') {
    throw new HttpError(409, 'Schedule the video interview before accepting this application');
  }
  if (input.status === 'OnHold' && application.status !== 'InterviewScheduled' && application.status !== 'OnHold') {
    throw new HttpError(409, 'Schedule the video interview before placing this application on hold');
  }
  if (application.status === 'Accepted' || application.status === 'Rejected' || application.status === 'Withdrawn') {
    throw new HttpError(409, `This application is already ${application.status.toLowerCase()}`);
  }
  application.set({ status: input.status, decisionNote: input.decisionNote, ...(input.status === 'Rejected' ? { demoSlotAt: null } : {}) });
  const decisionTitle = input.status === 'Accepted' ? 'Application selected' : input.status === 'Rejected' ? 'Application update' : 'Application on hold';
  const decisionMessage = input.decisionNote?.trim() || (input.status === 'Accepted'
    ? 'The vendor selected you for this training.'
    : input.status === 'OnHold' ? 'The vendor placed your application on hold.' : 'The vendor updated your application.');
  await withTransaction(async (session) => {
    await application.save(session ? { session } : undefined);
    await notifyTrainerOfApplicationUpdate({
      recipientId: application.trainerId as Types.ObjectId,
      kind: 'ApplicationUpdate',
      requirementId: requirement._id,
      applicationId: application._id,
      title: decisionTitle,
      message: decisionMessage,
    }, session);
  });
  await application.populate([
    { path: 'trainerId', select: 'name email phone photoUrl' },
    { path: 'requirementId', select: 'title city startDate endDate' },
  ]);
  response.json({ data: presentApplication(application.toObject() as unknown as ApplicationRecord, false, true) });
});

router.patch('/:applicationId/review', requireRole('Admin', 'Vendor'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const applicationId = objectId(request.params['applicationId'], 'application id');
  const input = parseBody(TrainerProjectReviewSchema, request.body, 'trainer review');
  const application = await Application.findOne({ _id: applicationId, deletedAt: null } as never);
  if (!application) throw notFound('Application');
  const requirement = await Requirement.findOne({ _id: application.requirementId, deletedAt: null } as never).lean();
  if (!requirement) throw notFound('Requirement');
  if (!canManageRequirement(actor, requirement as unknown as { organizationId: Types.ObjectId })) {
    throw new HttpError(403, 'Only the posting organization can rate this trainer');
  }
  if (application.status !== 'Accepted') throw new HttpError(409, 'Only a selected trainer can be rated');
  const endDate = (requirement.endDate as Date).toISOString().slice(0, 10);
  if (endDate >= new Date().toISOString().slice(0, 10)) {
    throw new HttpError(409, 'Trainer ratings are available after the training end date');
  }
  const review = input.review?.trim() || null;
  application.set({ trainerRating: input.rating, trainerReview: review, trainerReviewedAt: new Date() });
  await withTransaction(async (session) => {
    await application.save(session ? { session } : undefined);
    await notifyTrainerOfApplicationUpdate({
      recipientId: application.trainerId as Types.ObjectId,
      kind: 'ProjectRating',
      requirementId: requirement._id,
      applicationId: application._id,
      title: 'Project performance rated',
      message: `The vendor rated your project performance ${input.rating} out of 5.`,
    }, session);
  });
  await application.populate([
    { path: 'trainerId', select: 'name email phone photoUrl' },
    { path: 'requirementId', select: 'title city startDate endDate' },
  ]);
  response.json({ data: presentApplication(application.toObject() as unknown as ApplicationRecord, false, true) });
});

export { router as applicationsRouter };
