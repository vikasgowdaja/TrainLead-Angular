import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { RequirementDraftSchema } from '@trainlead/shared';
import { connectDatabase, disconnectDatabase } from './database.js';
import { Opportunity } from './models/opportunity.js';
import { Posting } from './models/posting.js';
import { User } from './models/user.js';
import { createOpportunityKey } from './requirements/dedupe.js';

const requirement = RequirementDraftSchema.parse({
  technologyStack: ['AngularJS'],
  startDate: '2026-11-02',
  endDate: '2026-11-07',
  durationDays: 6,
  college: null,
  city: 'Mysuru',
  mode: 'On-site',
  audience: '6th sem engineering students',
  travel: 'Provided',
  food: 'Provided',
  stay: 'Provided',
  tfa: 'Provided',
  paymentDate: '2026-11-25',
  summary: 'Six-day AngularJS training for 6th semester engineering students in Mysuru.',
});

const sources = [
  { sourceName: 'SkillBridge Academy', groupName: 'Karnataka Trainer Network', rate: 60000 },
  { sourceName: 'Campus Connect', groupName: 'Campus Connect - South', rate: 64000 },
  { sourceName: 'Tech Trainers India', groupName: 'Trainer Leads Karnataka', rate: 62000 },
];

async function seedAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.info('Skipped admin: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env to create one.');
    return;
  }
  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters.');
  }

  await User.findOneAndUpdate(
    { email },
    {
      $set: { role: 'Admin', passwordHash: await bcrypt.hash(password, 12), deletedAt: null },
      $setOnInsert: { email, name: 'TrainLead Admin' },
    },
    { upsert: true },
  );
  console.info(`Admin account ready: ${email}`);
}

async function seed(): Promise<void> {
  await connectDatabase();
  try {
    await seedAdmin();
    const dedupeKey = createOpportunityKey(requirement);
    const opportunity = await Opportunity.findOneAndUpdate(
      { dedupeKey },
      { $setOnInsert: { dedupeKey, ...requirement } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    await Posting.deleteMany({ opportunityId: opportunity['_id'] });
    await Posting.insertMany(
      sources.map((source) => ({
        ...source,
        opportunityId: opportunity['_id'],
        paymentDate: new Date('2026-11-25'),
        travel: requirement.travel,
        food: requirement.food,
        stay: requirement.stay,
      })),
    );

    console.info('Seeded one Mysuru opportunity with three source postings.');
  } finally {
    await disconnectDatabase();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seed failed.');
  process.exitCode = 1;
});