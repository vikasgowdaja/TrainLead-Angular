import { Router } from 'express';
import { ApplicationDecisionSchema, ApplyToRequirementSchema, InterviewScheduleSchema } from '@trainlead/shared';
import type { ApplicationStatus, ApplicationView } from '@trainlead/shared/domain';
import { Types } from 'mongoose';
import { actorOf, loadActor } from '../auth/actor.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError, notFound, objectId, parseBody } from '../http.js';
import { Application } from '../models/application.js';
import { Requirement } from '../models/requirement.js';
import { User } from '../models/user.js';
import { canManageRequirement } from '../services/access.js';

const router = Router();
router.use(requireAuth);

interface PopulatedUser {
  _id: Types.ObjectId;
  name: string;
  email?: string | null;
  phone?: string | null;
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
  status: ApplicationStatus;
  interviewProvider: ApplicationView['interview'] extends infer _T ? string | null : never;
  meetingUrl: string | null;
  interviewAt: Date | null;
  interviewNotes: string;
  decisionNote: string | null;
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
  const showContact = includeTrainerContact || application.status === 'Accepted';
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
      email: showContact ? trainer?.email ?? null : null,
      phone: showContact ? trainer?.phone ?? null : null,
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
    .populate('trainerId', 'name email phone')
    .populate('requirementId', 'title city startDate endDate')
    .sort({ createdAt: -1 })
    .lean();
  response.json({ data: applications.map((application) => presentApplication(application as unknown as ApplicationRecord, true, false)) });
});

router.get('/requirements/:requirementId/mine', requireRole('Trainer'), loadActor, async (request, response) => {
  const actor = actorOf(request);
  const requirementId = objectId(request.params['requirementId'], 'requirement id');
  const application = await Application.findOne({ requirementId, trainerId: actor.userId, deletedAt: null } as never)
    .populate('trainerId', 'name email phone')
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
  try {
    const application = await Application.create({
      requirementId,
      organizationId: requirement.organizationId,
      trainerId: actor.userId,
      coverNote: input.coverNote,
      expectedRate: input.expectedRate,
      status: 'Applied',
    });
    await application.populate([
      { path: 'trainerId', select: 'name email phone' },
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
    .populate('trainerId', 'name email phone')
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
    status: 'InterviewScheduled',
  });
  await application.save();
  await application.populate([
    { path: 'trainerId', select: 'name email phone' },
    { path: 'requirementId', select: 'title city startDate endDate' },
  ]);
  response.json({ data: presentApplication(application.toObject() as unknown as ApplicationRecord, false, true) });
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
  if (application.status !== 'InterviewScheduled' && input.status === 'Accepted') {
    throw new HttpError(409, 'Schedule the video interview before accepting this application');
  }
  if (application.status === 'Accepted' || application.status === 'Rejected' || application.status === 'Withdrawn') {
    throw new HttpError(409, `This application is already ${application.status.toLowerCase()}`);
  }
  application.set({ status: input.status, decisionNote: input.decisionNote });
  await application.save();
  await application.populate([
    { path: 'trainerId', select: 'name email phone' },
    { path: 'requirementId', select: 'title city startDate endDate' },
  ]);
  response.json({ data: presentApplication(application.toObject() as unknown as ApplicationRecord, false, true) });
});

export { router as applicationsRouter };
