import { parse as parseDelimited } from 'csv-parse/sync';
import type { ExtractionConfidence, ExtractedRequirement, SmartExtractionResult } from '@trainlead/shared/domain';
import { createWorker } from 'tesseract.js';
import { HttpError } from '../http.js';

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const CITY_STATES: Record<string, string> = {
  mysuru: 'Karnataka', mysore: 'Karnataka', bengaluru: 'Karnataka', bangalore: 'Karnataka',
  hyderabad: 'Telangana', chennai: 'Tamil Nadu', mumbai: 'Maharashtra', pune: 'Maharashtra',
  delhi: 'Delhi', noida: 'Uttar Pradesh', gurugram: 'Haryana', gurgaon: 'Haryana',
};

const SKILL_PATTERNS: [RegExp, string][] = [
  [/angular\s*\.?\s*js/i, 'AngularJS'], [/\bangular\b/i, 'Angular'],
  [/\breact(?:\.js)?\b/i, 'React'], [/\bnode\s*\.?\s*js\b/i, 'Node.js'],
  [/\bjavascript\b/i, 'JavaScript'], [/\btypescript\b/i, 'TypeScript'],
  [/\bexpress(?:\.js)?\b/i, 'Express'], [/\brest\s*apis?\b/i, 'REST APIs'],
  [/\bhtml\b/i, 'HTML'], [/\bcss\b/i, 'CSS'], [/\bfrontend development\b/i, 'Frontend Development'],
  [/\bpython\b/i, 'Python'], [/\bdjango\b/i, 'Django'], [/\bjava\b/i, 'Java'],
];

function normalizeKey(value: string): string {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseTable(input: string): { values: Map<string, string>; warnings: string[] } {
  const delimiter = input.split(/\r?\n/, 1)[0]?.includes('\t') ? '\t' : ',';
  let rows: Record<string, unknown>[];
  try {
    rows = parseDelimited(input.replace(/^\uFEFF/, ''), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      delimiter,
      relax_column_count: false,
    }) as Record<string, unknown>[];
  } catch {
    throw new HttpError(400, 'Could not parse the pasted table. Include one header row and a data row.');
  }
  if (!rows.length) throw new HttpError(400, 'The pasted table has a header row but no data row.');

  const first = rows[0]!;
  const values = new Map<string, string>();
  const keys = Object.keys(first);
  const fieldKeyHeader = keys.find((key) => ['field', 'fieldname', 'requirement'].includes(normalizeKey(key)));
  const fieldValueHeader = keys.find((key) => ['value', 'details', 'answer'].includes(normalizeKey(key)));
  if (fieldKeyHeader && fieldValueHeader) {
    for (const row of rows) {
      const key = String(row[fieldKeyHeader] ?? '').trim();
      const value = String(row[fieldValueHeader] ?? '').trim();
      if (key && value) values.set(normalizeKey(key), value);
    }
  } else {
    for (const [key, value] of Object.entries(first)) {
      if (value !== null && value !== undefined && String(value).trim()) values.set(normalizeKey(key), String(value).trim());
    }
  }
  return {
    values,
    warnings: rows.length > 1 ? [`${rows.length - 1} data rows were found; only the first row is being reviewed.`] : [],
  };
}

function textValues(input: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of input.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:=]{2,60})\s*[:=]\s*(.*?)\s*$/);
    if (match?.[1] && match[2]) values.set(normalizeKey(match[1]), match[2].trim());
  }
  return values;
}

function findValue(values: Map<string, string>, ...aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = values.get(normalizeKey(alias));
    if (value) return value;
  }
  return null;
}

function parseDate(value: string, today = new Date()): { date: string; inferredYear: boolean } | null {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { date: `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`, inferredYear: false };
  const numeric = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (numeric) {
    const date = new Date(Date.UTC(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1])));
    if (date.getUTCDate() !== Number(numeric[1]) || date.getUTCMonth() !== Number(numeric[2]) - 1) return null;
    return { date: date.toISOString().slice(0, 10), inferredYear: false };
  }
  const monthMatch = trimmed.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})(?:\s*,?\s*(\d{4}))?\b/i);
  if (!monthMatch) return null;
  const month = MONTHS[monthMatch[2]!.toLowerCase()];
  if (month === undefined) return null;
  const inferredYear = !monthMatch[3];
  let year = Number(monthMatch[3] ?? today.getUTCFullYear());
  let date = new Date(Date.UTC(year, month, Number(monthMatch[1])));
  if (date.getUTCDate() !== Number(monthMatch[1])) return null;
  if (inferredYear && date.getTime() < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) {
    year += 1;
    date = new Date(Date.UTC(year, month, Number(monthMatch[1])));
  }
  return { date: date.toISOString().slice(0, 10), inferredYear };
}

function parseMoney(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, '').match(/(?:₹|INR\s*|Rs\.?\s*)?\s*(\d+(?:\.\d{1,2})?)/i);
  return match ? Number(match[1]) : null;
}

function normalizeAudience(value: string): string {
  return value
    .replace(/\b6th\s*sem(?:ester)?\s*engg(?:ineering)?\s*students?\b/i, '6th Semester Engineering Students')
    .replace(/\b(\d+)(st|nd|rd|th)\s*sem(?:ester)?\b/gi, '$1$2 Semester');
}

function normalizePersonName(value: string): string {
  if (value !== value.toLocaleUpperCase('en')) return value;
  return value.toLocaleLowerCase('en').replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('en'));
}

function parseSupport(value: string | null): 'Provided' | 'Reimbursed' | 'Not provided' | 'Unknown' | null {
  if (!value) return null;
  if (/provided/i.test(value) && !/not provided/i.test(value)) return 'Provided';
  if (/reimburse/i.test(value)) return 'Reimbursed';
  if (/not provided|not included|own arrangement/i.test(value)) return 'Not provided';
  return null;
}

export function extractRequirement(input: string, inputType: 'text' | 'table' = 'text', today = new Date()): SmartExtractionResult {
  const original = input.trim();
  if (original.length < 5) throw new HttpError(400, 'Add requirement details before extraction.');
  const table = inputType === 'table' ? parseTable(original) : null;
  const normalizedText = original.replace(/\bangulards\b/gi, 'AngularJS');
  const values = table?.values ?? textValues(normalizedText);
  const extracted: ExtractedRequirement = {};
  const confidence: Record<string, 'high' | 'medium' | 'low'> = {};
  const warnings = [...(table?.warnings ?? [])];
  const set = <K extends keyof ExtractedRequirement>(key: K, value: ExtractedRequirement[K] | null | undefined, level: ExtractionConfidence = 'high') => {
    if (value !== null && value !== undefined && value !== '') {
      extracted[key] = value;
      confidence[String(key)] = level;
    }
  };

  const rawTitle = findValue(values, 'title', 'requirement title', 'training title');
  const description = findValue(values, 'description', 'details');
  const domain = findValue(values, 'domain');
  let skills = findValue(values, 'required skills', 'skills', 'technology stack', 'technologies', 'subject', 'topic')
    ?.split(/[,;|]/).map((skill) => skill.trim()).filter(Boolean) ?? [];
  if (!skills.length) skills = SKILL_PATTERNS.filter(([pattern]) => pattern.test(normalizedText)).map(([, skill]) => skill);
  skills = [...new Map(skills.map((skill) => [normalizeKey(skill), skill])).values()];
  if (skills.length) set('skills', skills);
  if (description) set('description', description);

  const cityRaw = findValue(values, 'city', 'location', 'venue')
    ?? original.match(/\b(?:location|city)\s*[:=]\s*([^\r\n,]+)/i)?.[1]?.trim()
    ?? null;
  const cityAliases: Record<string, string> = { mysore: 'Mysuru', bangalore: 'Bengaluru' };
  const city = cityRaw ? cityAliases[cityRaw.toLowerCase()] ?? cityRaw : null;
  set('city', city);
  const state = findValue(values, 'state') ?? (city ? CITY_STATES[city.toLowerCase()] ?? null : null);
  if (state) set('state', state, findValue(values, 'state') ? 'high' : 'medium');
  if (city && !findValue(values, 'state') && state) warnings.push(`State ${state} was inferred from ${city}.`);
  if (domain) set('domain', domain);
  else if (skills.some((skill) => /angular|react|javascript|frontend/i.test(skill))) {
    set('domain', 'Web Development', 'medium');
    warnings.push('Domain was inferred from the listed frontend skill; review it.');
  }

  const modeRaw = findValue(values, 'delivery mode', 'mode', 'delivery');
  const modeText = modeRaw ?? original;
  if (/\bonline\b/i.test(modeText)) set('mode', 'Online');
  else if (/\bhybrid\b/i.test(modeText)) set('mode', 'Hybrid');
  else if (/\boffline\b|on[- ]?site|in[- ]person|classroom/i.test(modeText)) set('mode', 'Offline');
  else warnings.push('Delivery mode was not stated. Select a mode before saving.');

  const startRaw = findValue(values, 'start date', 'start', 'from');
  const endRaw = findValue(values, 'end date', 'end', 'to');
  const rangeMatches = [...original.matchAll(/\b(\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,9}(?:\s*,?\s*\d{4})?)\s*(?:-|to|–)\s*(\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,9}(?:\s*,?\s*\d{4})?)\b/gi)];
  const startParsed = startRaw ? parseDate(startRaw, today) : rangeMatches[0]?.[1] ? parseDate(rangeMatches[0][1], today) : null;
  const endParsed = endRaw ? parseDate(endRaw, today) : rangeMatches[0]?.[2] ? parseDate(rangeMatches[0][2], today) : null;
  if (startParsed) set('startDate', startParsed.date);
  if (endParsed) set('endDate', endParsed.date);
  if (startParsed?.inferredYear || endParsed?.inferredYear) warnings.push(`A year was not stated; dates were resolved to ${startParsed?.date.slice(0, 4) ?? endParsed?.date.slice(0, 4)}. Confirm the year.`);

  const explicitDuration = findValue(values, 'duration in days', 'duration', 'days');
  const durationMatch = explicitDuration?.match(/\d+/) ?? original.match(/\bduration\s*[:=]?\s*(\d{1,3})\s*days?\b/i) ?? original.match(/\b(\d{1,3})\s+days?\b/i);
  const explicitDurationDays = durationMatch?.[0] ? Number(durationMatch[0].match(/\d+/)?.[0]) : null;
  const dateDuration = startParsed && endParsed && endParsed.date >= startParsed.date
    ? Math.round((Date.parse(`${endParsed.date}T00:00:00Z`) - Date.parse(`${startParsed.date}T00:00:00Z`)) / 86_400_000) + 1
    : null;
  if (explicitDurationDays) set('durationDays', explicitDurationDays);
  else if (dateDuration) set('durationDays', dateDuration, 'medium');
  if (explicitDurationDays && dateDuration && explicitDurationDays !== dateDuration) warnings.push('The stated duration differs from the calendar date range. Review it.');

  const audienceRaw = findValue(values, 'target audience', 'audience', 'participants', 'participant group');
  if (audienceRaw) set('audience', normalizeAudience(audienceRaw));
  else {
    const audience = original.match(/\b((?:\d+(?:st|nd|rd|th)\s*sem(?:ester)?\s*(?:engg|engineering)?\s*students?|final[- ]year[^\r\n,]*students?))\b/i)?.[1];
    if (audience) set('audience', normalizeAudience(audience), 'medium');
  }
  const studentCountRaw = findValue(values, 'number of students', 'student count', 'batch size', 'number of participants');
  const studentCountMatch = studentCountRaw?.match(/\d+/);
  if (studentCountMatch) set('studentCount', Number(studentCountMatch[0]));
  else warnings.push('Student count was not explicitly stated; it was left blank.');

  const experience = findValue(values, 'experience requirements', 'experience required', 'trainer experience');
  if (experience) set('experienceRequired', experience);

  const dailyColumn = findValue(values, 'daily budget', 'daily rate', 'rate per day');
  const explicitMin = parseMoney(findValue(values, 'budget minimum', 'minimum budget', 'budget min'));
  const explicitMax = parseMoney(findValue(values, 'budget maximum', 'maximum budget', 'budget max'));
  const dailyRaw = dailyColumn ?? findValue(values, 'commercial')
    ?? original.split(/\r?\n/).find((line) => /commercial|\bper day\b|\/\s*day/i.test(line))
    ?? null;
  const dailyRate = dailyColumn || /per day|\/\s*day|\bdaily\b/i.test(dailyRaw ?? '') ? parseMoney(dailyRaw) : null;
  if (explicitMin !== null) set('budgetMin', explicitMin);
  else if (dailyRate !== null) set('budgetMin', dailyRate);
  if (explicitMax !== null) set('budgetMax', explicitMax);
  else if (dailyRate !== null) set('budgetMax', dailyRate);
  const paymentTerms = findValue(values, 'payment terms', 'commercial terms') ?? dailyRaw;
  if (paymentTerms) set('paymentTerms', paymentTerms.replace(/\bno\s+tds\s+cut\b/i, 'No TDS deduction'));

  const paymentRaw = findValue(values, 'payment due date', 'payment date', 'payment');
  const paymentDateMatch = paymentRaw ?? original.match(/\bpayment\s+(?:date\s*[:=]?\s*)?(?:on\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,9}(?:\s*,?\s*\d{4})?)/i)?.[1] ?? null;
  const paymentDate = paymentDateMatch ? parseDate(paymentDateMatch, today) : null;
  if (paymentDate) set('paymentDueDate', paymentDate.date);
  if (paymentDate?.inferredYear) warnings.push(`Payment year was not stated; ${paymentDate.date.slice(0, 4)} was assumed. Confirm the year.`);

  const supportValue = (key: string, ...aliases: string[]) => parseSupport(findValue(values, key, ...aliases)
    ?? original.match(new RegExp(`\\b${key}\\s*[:=]?\\s*(provided|reimbursed|not provided)`, 'i'))?.[1]
    ?? null);
  const tfaProvided = /\btfa\s+(?:is\s+)?provided\b/i.test(original) || /\btfa\s+(?:is\s+)?provided\b/i.test(values.get('tfa') ?? '');
  set('travel', supportValue('travel') ?? (tfaProvided ? 'Provided' : null));
  set('food', supportValue('food') ?? (tfaProvided ? 'Provided' : null));
  set('stay', supportValue('stay', 'accommodation') ?? (tfaProvided ? 'Provided' : null));

  const organizationName = findValue(values, 'organization', 'organisation', 'company', 'vendor');
  const phone = findValue(values, 'phone', 'mobile', 'contact number') ?? original.match(/(?:\+?\d[\d\s-]{8,14}\d)/)?.[0]?.replace(/[\s-]/g, '') ?? null;
  const email = findValue(values, 'email', 'contact email') ?? original.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const greetingOrganization = original.match(/\b(?:namaste|hello|hi)\s+from\s+([A-Z][\w& .-]{1,50})/i)?.[1]?.trim() ?? null;
  const organization = organizationName ?? greetingOrganization;
  let contactPerson = findValue(values, 'contact person', 'contact name', 'contact');
  if (contactPerson && organization && normalizeKey(contactPerson).startsWith(normalizeKey(organization))) {
    contactPerson = contactPerson.slice(organization.length).trim() || null;
  }
  if (contactPerson) contactPerson = normalizePersonName(contactPerson);

  const title = rawTitle ?? (skills[0] && extracted['audience']
    ? `${skills[0]} Training for ${extracted['audience']}`
    : skills[0] ? `${skills[0]} Training` : null);
  if (title) set('title', title, rawTitle ? 'high' : 'medium');
  if (!rawTitle && title) warnings.push('Title was generated from the subject and audience; review it.');

  const publicLines = original.split(/\r?\n/).filter((line) =>
    !/^\s*(?:contact|contact person|phone|mobile|email|organization|organisation|company)\s*[:=]/i.test(line)
    && !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line)
    && !/(?:\+?\d[\d\s-]{8,14}\d)/.test(line),
  );
  if (!extracted['description'] && publicLines.length) {
    const description = publicLines.join('\n').trim().slice(0, 4000);
    if (description) set('description', description, 'medium');
  }

  const required = ['title', 'skills', 'city', 'mode', 'startDate', 'endDate', 'durationDays', 'audience'];
  const missingFields = required.filter((field) => {
    const value = extracted[field as keyof ExtractedRequirement];
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  });
  if (missingFields.includes('studentCount')) warnings.push('Student count was not explicitly stated; leave it blank unless confirmed.');
  if (!extracted['mode']) warnings.push('Delivery mode was not stated. Confirm it before publishing.');
  const estimatedTotalBudget = dailyRate !== null && extracted['durationDays'] ? dailyRate * extracted['durationDays'] : null;
  return {
    extracted,
    sourceDetails: { organizationName: organization, contactPerson, phone, email },
    extractedText: original,
    missingFields,
    warnings: [...new Set(warnings)],
    confidence,
    estimatedTotalBudget,
  };
}

export function parseRequirementTable(input: string): SmartExtractionResult {
  return extractRequirement(input, 'table');
}

export async function extractRequirementImage(image: Buffer): Promise<SmartExtractionResult> {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    worker = await createWorker('eng', 1, {
      ...(process.env['TESSDATA_PATH'] ? { langPath: process.env['TESSDATA_PATH'] } : {}),
      logger: () => undefined,
    });
    const result = await worker.recognize(image);
    if (!result.data.text.trim()) throw new HttpError(422, 'No readable text was found in the image. Try a clearer screenshot.');
    return extractRequirement(result.data.text, 'text');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, 'Could not read this image. Try a clear PNG, JPG, or WebP screenshot.');
  } finally {
    await worker?.terminate();
  }
}
