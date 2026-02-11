import { describe, it, expect } from 'vitest';
import { anonymizeProfiles } from './anonymizer';
import type { Profile } from '../domain/types';

function makeProfile(overrides: Partial<Profile> & { name: string }): Profile {
  return {
    id: overrides.id ?? `id-${overrides.name}`,
    workspaceId: 'ws-1',
    name: overrides.name,
    role: overrides.role ?? null,
    team: overrides.team ?? null,
    concerns: overrides.concerns ?? null,
    priorities: overrides.priorities ?? null,
    interviewQuotes: overrides.interviewQuotes ?? [],
    notes: overrides.notes ?? null,
    sourceFile: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

describe('anonymizeProfiles', () => {
  it('assigns deterministic labels sorted alphabetically by name', () => {
    const profiles = [
      makeProfile({ name: 'Charlie Brown' }),
      makeProfile({ name: 'Alice Smith' }),
      makeProfile({ name: 'Bob Jones' }),
    ];

    const { anonymizedProfiles, pseudonymMap } = anonymizeProfiles(profiles);

    // Sorted alphabetically: Alice, Bob, Charlie
    expect(anonymizedProfiles[0]!.label).toBe('Stakeholder A');
    expect(anonymizedProfiles[1]!.label).toBe('Stakeholder B');
    expect(anonymizedProfiles[2]!.label).toBe('Stakeholder C');

    expect(pseudonymMap['Stakeholder A']).toBe('Alice Smith');
    expect(pseudonymMap['Stakeholder B']).toBe('Bob Jones');
    expect(pseudonymMap['Stakeholder C']).toBe('Charlie Brown');
  });

  it('preserves role and team without anonymization', () => {
    const profiles = [
      makeProfile({ name: 'Jane Doe', role: 'Staff Engineer', team: 'Platform' }),
    ];

    const { anonymizedProfiles } = anonymizeProfiles(profiles);
    expect(anonymizedProfiles[0]!.role).toBe('Staff Engineer');
    expect(anonymizedProfiles[0]!.team).toBe('Platform');
  });

  it('scrubs stakeholder names from free text fields', () => {
    const profiles = [
      makeProfile({
        name: 'Alice Smith',
        concerns: 'I spoke with Bob Jones about this issue',
      }),
      makeProfile({
        name: 'Bob Jones',
        notes: 'Alice mentioned scaling problems',
      }),
    ];

    const { anonymizedProfiles } = anonymizeProfiles(profiles);

    // Alice is Stakeholder A, Bob is Stakeholder B
    const alice = anonymizedProfiles[0]!;
    const bob = anonymizedProfiles[1]!;

    expect(alice.concerns).toContain('Stakeholder B');
    expect(alice.concerns).not.toContain('Bob Jones');
    expect(alice.concerns).not.toContain('Bob');

    expect(bob.notes).toContain('Stakeholder A');
    expect(bob.notes).not.toContain('Alice');
  });

  it('scrubs names from interview quotes', () => {
    const profiles = [
      makeProfile({
        name: 'Alice Smith',
        interviewQuotes: ['Bob told me the system is fragile'],
      }),
      makeProfile({ name: 'Bob Jones' }),
    ];

    const { anonymizedProfiles } = anonymizeProfiles(profiles);
    const aliceQuotes = anonymizedProfiles[0]!.quotes;
    expect(aliceQuotes[0]).toContain('Stakeholder B');
    expect(aliceQuotes[0]).not.toContain('Bob');
  });

  it('handles profiles with null fields', () => {
    const profiles = [
      makeProfile({ name: 'Solo Dev' }),
    ];

    const { anonymizedProfiles } = anonymizeProfiles(profiles);
    expect(anonymizedProfiles[0]!.label).toBe('Stakeholder A');
    expect(anonymizedProfiles[0]!.concerns).toBeNull();
    expect(anonymizedProfiles[0]!.priorities).toBeNull();
    expect(anonymizedProfiles[0]!.notes).toBeNull();
    expect(anonymizedProfiles[0]!.quotes).toEqual([]);
  });

  it('generates labels beyond Z for large sets', () => {
    const profiles = Array.from({ length: 27 }, (_, i) =>
      makeProfile({ name: `Person ${String(i).padStart(2, '0')}` }),
    );

    const { anonymizedProfiles } = anonymizeProfiles(profiles);
    expect(anonymizedProfiles[25]!.label).toBe('Stakeholder Z');
    expect(anonymizedProfiles[26]!.label).toBe('Stakeholder AA');
  });
});
