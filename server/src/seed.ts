import 'dotenv/config';
import { RequirementDraftSchema } from '@trainlead/shared';
import { connectDatabase, disconnectDatabase } from './database.js';
import { Opportunity } from './models/opportunity.js';
import { Posting } from './models/posting.js';
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

async function seed(): Promise<void> {
  await connectDatabase();
  try {
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