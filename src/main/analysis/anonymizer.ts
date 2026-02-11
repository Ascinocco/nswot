import type { Profile, AnonymizedProfile } from '../domain/types';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateLabel(index: number): string {
  if (index < 26) return `Stakeholder ${ALPHABET[index]}`;
  const first = ALPHABET[Math.floor(index / 26) - 1];
  const second = ALPHABET[index % 26];
  return `Stakeholder ${first}${second}`;
}

export interface AnonymizeResult {
  anonymizedProfiles: AnonymizedProfile[];
  pseudonymMap: Record<string, string>;
}

export function anonymizeProfiles(profiles: Profile[]): AnonymizeResult {
  const sorted = [...profiles].sort((a, b) => a.name.localeCompare(b.name));

  const pseudonymMap: Record<string, string> = {};
  const anonymizedProfiles: AnonymizedProfile[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const profile = sorted[i]!;
    const label = generateLabel(i);
    pseudonymMap[label] = profile.name;

    anonymizedProfiles.push({
      label,
      role: profile.role,
      team: profile.team,
      concerns: scrubNames(profile.concerns, sorted, i),
      priorities: scrubNames(profile.priorities, sorted, i),
      quotes: profile.interviewQuotes.map((q) => scrubNames(q, sorted, i) ?? ''),
      notes: scrubNames(profile.notes, sorted, i),
    });
  }

  return { anonymizedProfiles, pseudonymMap };
}

function scrubNames(
  text: string | null,
  profiles: Profile[],
  _selfIndex: number,
): string | null {
  if (!text) return null;
  let result = text;
  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i]!;
    const name = profile.name;
    if (name.length < 2) continue;
    const label = generateLabel(i);
    result = replaceAll(result, name, label);
    // Also scrub first name only (if multi-word name)
    const firstName = name.split(' ')[0];
    if (firstName && firstName.length > 2 && firstName !== name) {
      result = replaceAll(result, firstName, label);
    }
  }
  return result;
}

function replaceAll(text: string, search: string, replacement: string): string {
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), replacement);
}
