import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { RequirementInputSchema } from '@trainlead/shared';
import { connectDatabase, disconnectDatabase } from './database.js';
import { Organization } from './models/organization.js';
import { Requirement } from './models/requirement.js';
import { RequirementSource } from './models/requirement-source.js';
import { User } from './models/user.js';
import { autoGroup, computeMatchKey } from './services/grouping.js';
import { resolveSkills } from './services/skills.js';

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
    const sources = [
      {
        name: 'SkillBridge Academy',
        group: 'Karnataka Trainer Network',
        title: 'AngularJS foundations for engineering students',
        text: 'AngularJS, 6 days, 2-7 Nov, Mysuru, 6th sem engg students, TFA provided, payment on 25 Nov',
        budgetMin: 60000,
        budgetMax: 65000,
      },
      {
        name: 'Campus Connect',
        group: 'Campus Connect - South',
        title: 'Angular JS foundations for engineering students',
        text: 'Need an Angular JS trainer in Mysuru from 2 Nov to 7 Nov for 6th semester engineering students. Travel, food and stay provided.',
        budgetMin: 64000,
        budgetMax: 68000,
      },
      {
        name: 'Tech Trainers India',
        group: 'Trainer Leads Karnataka',
        title: 'AngularJS training in Mysuru',
        text: 'AngularJS six-day programme for 6th semester students, Mysuru, 2-7 November.',
        budgetMin: 62000,
        budgetMax: 67000,
      },
    ];

    const createdIds = [];
    for (const source of sources) {
      const nameKey = source.name.normalize('NFKC').trim().toLowerCase();
      const organization = await Organization.findOneAndUpdate(
        { nameKey },
        {
          $setOnInsert: {
            nameKey,
            legalName: source.name,
            brandName: source.name,
            type: 'Training company',
            city: 'Mysuru',
            state: 'Karnataka',
            primaryContactName: 'Training Coordinator',
            verificationStatus: 'Pending',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      const fields = RequirementInputSchema.parse({
        title: source.title,
        description: 'Six-day AngularJS training for 6th semester engineering students in Mysuru.',
        domain: 'Frontend development',
        skills: ['AngularJS', 'JavaScript'],
        city: 'Mysuru',
        state: 'Karnataka',
        mode: 'Offline',
        startDate: '2026-11-02',
        endDate: '2026-11-07',
        durationDays: 6,
        audience: '6th sem engineering students',
        studentCount: 60,
        experienceRequired: 'Prior classroom training experience preferred',
        budgetMin: source.budgetMin,
        budgetMax: source.budgetMax,
        paymentTerms: 'Payment on 25 November 2026',
        paymentDueDate: '2026-11-25',
        travel: 'Provided',
        food: 'Provided',
        stay: 'Provided',
      });
      const skills = await resolveSkills(fields.skills, null);
      const matchKey = computeMatchKey(fields.city, fields.startDate, fields.endDate);
      const requirement = await Requirement.findOneAndUpdate(
        { organizationId: organization._id, title: source.title, startDate: new Date(fields.startDate) },
        {
          $setOnInsert: {
            ...fields,
            organizationId: organization._id,
            createdBy: null,
            skillIds: skills.ids,
            skillNames: skills.names,
            skillKeys: skills.keys,
            status: 'Open',
            publishedAt: new Date(),
            matchKey,
            autoGroupOptOut: false,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      await RequirementSource.findOneAndUpdate(
        { requirementId: requirement._id, sourceType: 'WhatsApp', groupName: source.group },
        {
          $setOnInsert: {
            requirementId: requirement._id,
            organizationId: organization._id,
            sourceType: 'WhatsApp',
            groupName: source.group,
            rawText: source.text,
            postedAt: new Date('2026-11-01T09:00:00+05:30'),
            createdBy: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      createdIds.push(requirement._id);
    }
    for (const id of createdIds) await autoGroup(id);

    console.info('Seeded three Mysuru vendor requirements and source posts for one grouped opportunity.');
  } finally {
    await disconnectDatabase();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seed failed.');
  process.exitCode = 1;
});