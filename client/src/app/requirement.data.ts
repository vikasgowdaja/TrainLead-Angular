import { InboxPost, Requirement } from './requirement.model';

const providedTfa = [
  { label: 'Travel', status: 'Provided' },
  { label: 'Food', status: 'Provided' },
  { label: 'Stay', status: 'Provided' },
] as const;

export const demoRequirements: Requirement[] = [
  {
    id: 'mysuru-angularjs-2026',
    title: 'AngularJS foundations for engineering students',
    stack: ['AngularJS', 'JavaScript'],
    dateLabel: '02 - 07 Nov 2026',
    durationDays: 6,
    city: 'Mysuru',
    audience: '6th sem engineering students',
    tfa: 'Provided',
    paymentDate: '25 Nov 2026',
    postingCount: 3,
    groupCount: 2,
    sources: ['SkillBridge Academy', 'Campus Connect', 'Tech Trainers India'],
    support: [...providedTfa],
  },
  {
    id: 'react-bengaluru-2026',
    title: 'React and API integration bootcamp',
    stack: ['React', 'REST APIs'],
    dateLabel: '16 - 18 Nov 2026',
    durationDays: 3,
    city: 'Bengaluru',
    audience: 'Final-year computer science students',
    tfa: 'Reimbursed',
    paymentDate: null,
    postingCount: 1,
    groupCount: 1,
    sources: ['Campus Connect'],
    support: [
      { label: 'Travel', status: 'Reimbursed' },
      { label: 'Food', status: 'Provided' },
      { label: 'Stay', status: 'Unknown' },
    ],
  },
  {
    id: 'node-hyderabad-2026',
    title: 'Node.js services for a product team',
    stack: ['Node.js', 'Express'],
    dateLabel: '23 - 24 Nov 2026',
    durationDays: 2,
    city: 'Hyderabad',
    audience: 'Early-career software engineers',
    tfa: 'Unknown',
    paymentDate: null,
    postingCount: 1,
    groupCount: 1,
    sources: ['SkillBridge Academy'],
    support: [
      { label: 'Travel', status: 'Unknown' },
      { label: 'Food', status: 'Unknown' },
      { label: 'Stay', status: 'Unknown' },
    ],
  },
];

export const inboxPosts: InboxPost[] = [
  {
    id: 'post-mysuru-1',
    source: 'SkillBridge Academy',
    sourceInitial: 'S',
    receivedAt: 'Today, 9:42 AM',
    group: 'Karnataka Trainer Network',
    text: 'AngularJS, 6 days, 2-7 Nov, Mysuru, 6th sem engg students, TFA provided, payment on 25 Nov',
  },
  {
    id: 'post-mysuru-2',
    source: 'Campus Connect',
    sourceInitial: 'C',
    receivedAt: 'Today, 10:18 AM',
    group: 'Campus Connect - South',
    text: 'Need an AngularJS trainer in Mysuru from 2 Nov to 7 Nov for 6th semester engineering students. Travel, food and stay provided.',
  },
];