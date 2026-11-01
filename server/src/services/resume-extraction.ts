import { PDFParse } from 'pdf-parse';
import { skillKey } from '@trainlead/shared';
import type { TrainerProfileSuggestions } from '@trainlead/shared/domain';
import { Skill } from '../models/skill.js';

const MAX_RESUME_TEXT_LENGTH = 100_000;

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  return match?.[0]?.replace(/[.,;:]+$/, '') ?? null;
}

function extractName(text: string): string | null {
  return text.split(/\r?\n/).slice(0, 12).map((line) => line.trim()).find((line) =>
    line.length >= 4 && line.length <= 80 && /^[\p{L}][\p{L}'-]+(?:\s+[\p{L}][\p{L}'-]+){1,3}$/u.test(line),
  ) ?? null;
}

function extractLocation(text: string): string | null {
  const match = /(?:location|based in|address|city)\s*[:\-]\s*([^\r\n]{2,100})/i.exec(text);
  return match?.[1]?.split(/[|•·]/)[0]?.trim().slice(0, 120) ?? null;
}

function extractLink(text: string, host: string): string | null {
  const escapedHost = host.replaceAll('.', '\\.');
  const pattern = new RegExp(`https?:\\/\\/(?:www\\.)?${escapedHost}\\/[^\\s<>"']+`, 'i');
  const match = firstMatch(text, pattern);
  return match?.replace(/[),\]}]+$/, '') ?? null;
}

function extractPhone(text: string): string | null {
  const candidates = text.match(/\+?\d[\d\s().-]{8,}\d/g) ?? [];
  return candidates.map((value) => value.trim().replace(/[().\s-]/g, ''))
    .find((value) => /^\+?\d{10,15}$/.test(value)) ?? null;
}

export async function extractTrainerProfileFromResume(buffer: Buffer): Promise<TrainerProfileSuggestions> {
  const parser = new PDFParse({ data: buffer });
  let resumeText: string;
  try {
    const parsed = await parser.getText();
    resumeText = parsed.text.slice(0, MAX_RESUME_TEXT_LENGTH);
  } finally {
    await parser.destroy();
  }

  const normalizedText = skillKey(resumeText);
  const catalog = await Skill.find({}).select('name aliases').lean();
  const matchedSkills = new Set<string>();
  for (const skill of catalog) {
    const candidates = [skill.name, ...skill.aliases];
    if (candidates.some((candidate) => {
      const normalized = skillKey(candidate);
      return normalized.length >= 3 && normalizedText.includes(normalized);
    })) matchedSkills.add(skill.name);
    if (matchedSkills.size === 20) break;
  }

  return {
    name: extractName(resumeText),
    email: firstMatch(resumeText, /[\w.+-]+@[\w.-]+\.[A-Z]{2,}/i)?.toLowerCase() ?? null,
    phone: extractPhone(resumeText),
    location: extractLocation(resumeText),
    skills: [...matchedSkills],
    githubUrl: extractLink(resumeText, 'github.com'),
    linkedinUrl: extractLink(resumeText, 'linkedin.com'),
    leetcodeUrl: extractLink(resumeText, 'leetcode.com'),
  };
}
