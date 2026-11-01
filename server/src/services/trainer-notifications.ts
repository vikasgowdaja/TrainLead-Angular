import type { ClientSession, Types } from 'mongoose';
import { skillKey } from '@trainlead/shared';
import type { TrainerNotificationKind } from '@trainlead/shared/domain';
import { Notification } from '../models/notification.js';
import { User } from '../models/user.js';

interface TrainerNotificationInput {
  recipientId: Types.ObjectId;
  kind: TrainerNotificationKind;
  requirementId: Types.ObjectId;
  applicationId?: Types.ObjectId | null;
  title: string;
  message: string;
}

export async function notifyMatchingTrainersOfRequirement(
  requirementId: Types.ObjectId,
  title: string,
  skillNames: string[],
  session?: ClientSession,
): Promise<void> {
  const requiredSkills = new Set(skillNames.map(skillKey));
  if (!requiredSkills.size) return;

  const trainersQuery = User.find({ role: 'Trainer', deletedAt: null }).select('_id skills');
  if (session) trainersQuery.session(session);
  const trainers = await trainersQuery.lean() as { _id: Types.ObjectId; skills?: string[] }[];
  const recipients = trainers.filter((trainer) => (trainer.skills ?? []).some((skill) => requiredSkills.has(skillKey(skill))));
  if (!recipients.length) return;

  const notifications = recipients.map((trainer) => ({
    recipientId: trainer._id,
    kind: 'NewRequirement',
    requirementId,
    applicationId: null,
    title: 'New matching training requirement',
    message: title,
  }));
  if (session) await Notification.insertMany(notifications, { session });
  else await Notification.insertMany(notifications);
}

export async function notifyTrainerOfApplicationUpdate(
  input: TrainerNotificationInput,
  session?: ClientSession,
): Promise<void> {
  await Notification.create([{
    recipientId: input.recipientId,
    kind: input.kind,
    requirementId: input.requirementId,
    applicationId: input.applicationId ?? null,
    title: input.title,
    message: input.message,
  }], session ? { session } : undefined);
}
