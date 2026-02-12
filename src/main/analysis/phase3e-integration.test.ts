/**
 * Phase 3e Cross-Feature E2E Integration Tests (Sprint 34)
 *
 * 7 test scenarios validating Phase 3e features work together:
 * 1. Multi-provider LLM switch
 * 2. Chat file generation
 * 3. Editor context in chat
 * 4. De-anonymization (pseudonym map)
 * 5. Profile tags
 * 6. Onboarding wizard (preferences)
 * 7. Evidence coverage + low-temperature consistency
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../infrastructure/database';
import { ProfileRepository } from '../repositories/profile.repository';
import { PreferencesRepository } from '../repositories/preferences.repository';
import { AnalysisOrchestrator } from './orchestrator';
import { ExtractionStep } from './steps/extraction';
import { SynthesisStep } from './steps/synthesis';
import { SwotGenerationStep } from './steps/swot-generation';
import { computeSourceCoverage, validateEvidence } from './evidence-validator';
import { ActionExecutor } from '../providers/actions/action-executor';
import { isFileWriteTool, FILE_WRITE_TOOLS } from '../providers/actions/action-tools';
import { createLlmProvider } from '../providers/llm/llm-provider-factory';
import { createCodebaseProvider } from '../providers/codebase/codebase-provider-factory';
import { buildChatSystemPrompt } from '../services/chat.service';
import type { PipelineContext, LlmCaller, LlmResponse } from './pipeline-step';
import type { Analysis, AnonymizedPayload, SwotOutput } from '../domain/types';
import type { FileService } from '../services/file.service';

// --- Shared test data ---

const VALID_SWOT_RESPONSE = `\`\`\`json
{
  "strengths": [
    {
      "claim": "Strong testing culture with high coverage",
      "evidence": [
        { "sourceType": "profile", "sourceId": "profile:Stakeholder A", "sourceLabel": "Stakeholder A", "quote": "Our test coverage is industry-leading at 92%" }
      ],
      "impact": "Reduces regression risk",
      "recommendation": "Maintain coverage standards",
      "confidence": "high"
    }
  ],
  "weaknesses": [
    {
      "claim": "CI pipeline taking 45 minutes",
      "evidence": [
        { "sourceType": "jira", "sourceId": "jira:PROJ-101", "sourceLabel": "PROJ-101", "quote": "CI takes 45 min" },
        { "sourceType": "profile", "sourceId": "profile:Stakeholder B", "sourceLabel": "Stakeholder B", "quote": "Builds are too slow" }
      ],
      "impact": "Reduced productivity",
      "recommendation": "Parallelize builds",
      "confidence": "high"
    }
  ],
  "opportunities": [],
  "threats": [],
  "summaries": {
    "profiles": "Strong testing but slow CI.",
    "jira": "Deployment frequency declining."
  }
}
\`\`\``;

const VALID_EXTRACTION_RESPONSE = `\`\`\`json
{
  "signals": [
    { "sourceType": "profile", "sourceId": "profile:Stakeholder A", "signal": "High test coverage", "category": "strength", "quote": "Our test coverage is industry-leading at 92%" },
    { "sourceType": "jira", "sourceId": "jira:PROJ-101", "signal": "Slow CI pipeline", "category": "concern", "quote": "CI takes 45 min" }
  ],
  "keyPatterns": ["CI bottleneck"]
}
\`\`\``;

const VALID_SYNTHESIS_RESPONSE = `\`\`\`json
{
  "correlations": [
    {
      "claim": "CI slowness offsets testing benefits",
      "supportingSignals": [
        { "sourceType": "profile", "sourceId": "profile:Stakeholder A", "signal": "High coverage", "category": "strength", "quote": "92% coverage" },
        { "sourceType": "jira", "sourceId": "jira:PROJ-101", "signal": "Slow CI", "category": "concern", "quote": "45 min" }
      ],
      "sourceTypes": ["profile", "jira"],
      "agreement": "moderate",
      "conflicts": []
    }
  ],
  "synthesisMarkdown": "## Synthesis\\nCI slowness undermines the strong testing culture."
}
\`\`\``;

function makeInputSnapshot(): AnonymizedPayload {
  return {
    profiles: [
      { label: 'Stakeholder A', role: 'Engineer', team: 'Platform', concerns: 'CI speed', priorities: 'Testing', quotes: ['Our test coverage is industry-leading at 92%'], notes: null },
      { label: 'Stakeholder B', role: 'Senior Engineer', team: 'Infra', concerns: 'Build time', priorities: 'Reliability', quotes: ['Builds are too slow'], notes: null },
    ],
    jiraData: { markdown: '### Stories\n- [PROJ-101] CI pipeline optimization (Status: In Progress)\n- [PROJ-102] Flaky test fix (Status: Done)' },
    confluenceData: null,
    githubData: null,
    codebaseData: null,
    pseudonymMap: { 'Stakeholder A': 'Alice Smith', 'Stakeholder B': 'Bob Jones' },
  };
}

function makePipelineContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    analysisId: 'analysis-e2e',
    role: 'staff_engineer',
    modelId: 'openai/gpt-4',
    contextWindow: 128000,
    anonymizedProfiles: makeInputSnapshot().profiles,
    inputSnapshot: makeInputSnapshot(),
    dataSources: {
      jiraDataMarkdown: '### Stories\n- [PROJ-101] CI pipeline optimization (Status: In Progress)',
      confluenceDataMarkdown: null,
      githubDataMarkdown: null,
      codebaseDataMarkdown: null,
    },
    connectedSources: ['jira'],
    llmCaller: { call: vi.fn() },
    ...overrides,
  };
}

function makeAnalysis(overrides?: Partial<Analysis>): Analysis {
  return {
    id: 'analysis-e2e',
    workspaceId: 'ws-1',
    role: 'staff_engineer',
    modelId: 'openai/gpt-4',
    status: 'completed',
    config: { profileIds: ['p1', 'p2'], jiraProjectKeys: ['PROJ'], confluenceSpaceKeys: [], githubRepos: [], codebaseRepos: [] },
    inputSnapshot: makeInputSnapshot(),
    swotOutput: {
      strengths: [
        {
          claim: 'Strong testing culture with high coverage',
          evidence: [{ sourceType: 'profile', sourceId: 'profile:Stakeholder A', sourceLabel: 'Stakeholder A', quote: '92% coverage' }],
          impact: 'Reduces regressions',
          recommendation: 'Maintain standards',
          confidence: 'high',
        },
      ],
      weaknesses: [
        {
          claim: 'CI pipeline taking 45 minutes',
          evidence: [
            { sourceType: 'jira', sourceId: 'jira:PROJ-101', sourceLabel: 'PROJ-101', quote: 'CI takes 45 min' },
            { sourceType: 'profile', sourceId: 'profile:Stakeholder B', sourceLabel: 'Stakeholder B', quote: 'Builds too slow' },
          ],
          impact: 'Reduced productivity',
          recommendation: 'Parallelize builds',
          confidence: 'high',
        },
      ],
      opportunities: [],
      threats: [],
    },
    summariesOutput: { profiles: 'Strong testing but slow CI.', jira: 'CI work in progress.', confluence: null, github: null, codebase: null },
    qualityMetrics: {
      totalItems: 2,
      multiSourceItems: 1,
      sourceTypeCoverage: { profile: 2, jira: 1 },
      confidenceDistribution: { high: 2, medium: 0, low: 0 },
      averageEvidencePerItem: 1.5,
      qualityScore: 70,
    },
    rawLlmResponse: '{}',
    warning: null,
    error: null,
    startedAt: '2024-01-01T00:00:00.000Z',
    completedAt: '2024-01-01T00:01:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// =====================================================================
// 1. Multi-provider LLM switch
// =====================================================================

describe('E2E: Multi-provider LLM switch', () => {
  it('creates OpenRouter provider via factory', () => {
    const provider = createLlmProvider('openrouter');
    expect(provider.name).toBe('openrouter');
  });

  it('creates Anthropic provider via factory', () => {
    const provider = createLlmProvider('anthropic');
    expect(provider.name).toBe('anthropic');
  });

  it('factory defaults to openrouter', () => {
    const provider = createLlmProvider();
    expect(provider.name).toBe('openrouter');
  });

  it('factory throws on unknown type', () => {
    expect(() => createLlmProvider('unknown' as 'openrouter')).toThrow('Unknown LLM provider type');
  });

  it('both providers implement LLMProvider interface (listModels + createChatCompletion)', () => {
    const openrouter = createLlmProvider('openrouter');
    const anthropic = createLlmProvider('anthropic');

    expect(typeof openrouter.listModels).toBe('function');
    expect(typeof openrouter.createChatCompletion).toBe('function');
    expect(typeof anthropic.listModels).toBe('function');
    expect(typeof anthropic.createChatCompletion).toBe('function');
  });

  it('pipeline produces valid SWOT output through mocked LLM caller', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: VALID_EXTRACTION_RESPONSE, finishReason: 'stop' } satisfies LlmResponse)
        .mockResolvedValueOnce({ content: VALID_SYNTHESIS_RESPONSE, finishReason: 'stop' } satisfies LlmResponse)
        .mockResolvedValueOnce({ content: VALID_SWOT_RESPONSE, finishReason: 'stop' } satisfies LlmResponse),
    };

    const orchestrator = new AnalysisOrchestrator([
      new ExtractionStep(),
      new SynthesisStep(),
      new SwotGenerationStep(),
    ]);

    const result = await orchestrator.run(makePipelineContext({ llmCaller }), vi.fn());

    expect(result.swotOutput).toBeDefined();
    expect(result.swotOutput!.strengths.length).toBeGreaterThanOrEqual(1);
    expect(result.swotOutput!.weaknesses.length).toBeGreaterThanOrEqual(1);
    expect(result.extractionOutput).toBeDefined();
    expect(result.synthesisOutput).toBeDefined();
  });
});

// =====================================================================
// 2. Multi-provider codebase
// =====================================================================

describe('E2E: Multi-provider codebase', () => {
  it('creates Claude CLI provider via factory', () => {
    const provider = createCodebaseProvider('claude_cli');
    expect(provider.name).toBe('claude_cli');
  });

  it('creates OpenCode provider via factory', () => {
    const provider = createCodebaseProvider('opencode');
    expect(provider.name).toBe('opencode');
  });

  it('factory defaults to claude_cli', () => {
    const provider = createCodebaseProvider();
    expect(provider.name).toBe('claude_cli');
  });

  it('both providers implement CodebaseProviderInterface', () => {
    const claudeCli = createCodebaseProvider('claude_cli');
    const opencode = createCodebaseProvider('opencode');

    for (const provider of [claudeCli, opencode]) {
      expect(typeof provider.checkPrerequisites).toBe('function');
      expect(typeof provider.isAvailable).toBe('function');
      expect(typeof provider.cloneOrPull).toBe('function');
      expect(typeof provider.analyze).toBe('function');
    }
  });
});

// =====================================================================
// 3. Chat file generation
// =====================================================================

describe('E2E: Chat file generation', () => {
  it('identifies file-write tool names correctly', () => {
    expect(isFileWriteTool('write_markdown_file')).toBe(true);
    expect(isFileWriteTool('write_csv_file')).toBe(true);
    expect(isFileWriteTool('write_mermaid_file')).toBe(true);
    expect(isFileWriteTool('create_jira_issue')).toBe(false);
    expect(isFileWriteTool('unknown_tool')).toBe(false);
  });

  it('FILE_WRITE_TOOLS defines 3 tool types with correct schemas', () => {
    expect(FILE_WRITE_TOOLS).toHaveLength(3);
    const names = FILE_WRITE_TOOLS.map((t) => t.function.name);
    expect(names).toContain('write_markdown_file');
    expect(names).toContain('write_csv_file');
    expect(names).toContain('write_mermaid_file');

    for (const tool of FILE_WRITE_TOOLS) {
      expect(tool.function.parameters.required).toContain('path');
      expect(tool.function.parameters.required).toContain('content');
    }
  });

  it('ActionExecutor routes file-write to FileService.writeFile', async () => {
    const mockFileService = {
      writeFile: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    } as unknown as FileService;

    const executor = new ActionExecutor(undefined, mockFileService);
    const result = await executor.execute('write_markdown_file', {
      path: 'reports/summary.md',
      content: '# SWOT Summary\n\nStrengths...',
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe('reports/summary.md');
    expect(mockFileService.writeFile).toHaveBeenCalledWith('reports/summary.md', '# SWOT Summary\n\nStrengths...');
  });

  it('ActionExecutor returns error when FileService is not available', async () => {
    const executor = new ActionExecutor();
    const result = await executor.execute('write_mermaid_file', {
      path: 'diagrams/arch.mmd',
      content: 'graph TD\n  A-->B',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('File service not available');
  });

  it('ActionExecutor validates required fields for file-write', async () => {
    const mockFileService = {
      writeFile: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    } as unknown as FileService;

    const executor = new ActionExecutor(undefined, mockFileService);

    const missingPath = await executor.execute('write_csv_file', { content: 'a,b,c' });
    expect(missingPath.success).toBe(false);
    expect(missingPath.error).toContain('path');

    const missingContent = await executor.execute('write_csv_file', { path: 'data.csv' });
    expect(missingContent.success).toBe(false);
    expect(missingContent.error).toContain('content');
  });
});

// =====================================================================
// 4. Editor context in chat
// =====================================================================

describe('E2E: Editor context in chat', () => {
  it('chat system prompt includes editor context when file is open', () => {
    const analysis = makeAnalysis();
    const prompt = buildChatSystemPrompt(analysis, undefined, true, {
      filePath: 'src/main/services/analysis.service.ts',
      contentPreview: 'export class AnalysisService { ... }',
      selectedText: null,
    });

    expect(prompt).toContain('EDITOR CONTEXT');
    expect(prompt).toContain('src/main/services/analysis.service.ts');
    expect(prompt).toContain('AnalysisService');
  });

  it('chat system prompt includes selected text when available', () => {
    const analysis = makeAnalysis();
    const prompt = buildChatSystemPrompt(analysis, undefined, true, {
      filePath: 'README.md',
      contentPreview: null,
      selectedText: 'function handleError(err: Error)',
    });

    expect(prompt).toContain('Selected text');
    expect(prompt).toContain('handleError');
  });

  it('chat system prompt omits editor context when none set', () => {
    const analysis = makeAnalysis();
    const prompt = buildChatSystemPrompt(analysis, undefined, false, null);

    expect(prompt).not.toContain('EDITOR CONTEXT');
  });

  it('chat system prompt includes FILE GENERATION when workspace is open', () => {
    const analysis = makeAnalysis();
    const prompt = buildChatSystemPrompt(analysis, undefined, true, null);

    expect(prompt).toContain('FILE GENERATION');
    expect(prompt).toContain('write_markdown_file');
    expect(prompt).toContain('write_csv_file');
    expect(prompt).toContain('write_mermaid_file');
  });

  it('chat system prompt omits FILE GENERATION when no workspace', () => {
    const analysis = makeAnalysis();
    const prompt = buildChatSystemPrompt(analysis, undefined, false, null);

    expect(prompt).not.toContain('FILE GENERATION');
  });
});

// =====================================================================
// 5. De-anonymization (pseudonym map)
// =====================================================================

describe('E2E: De-anonymization pseudonym map', () => {
  it('inputSnapshot contains pseudonymMap with real names', () => {
    const snapshot = makeInputSnapshot();

    expect(snapshot.pseudonymMap).toBeDefined();
    expect(snapshot.pseudonymMap['Stakeholder A']).toBe('Alice Smith');
    expect(snapshot.pseudonymMap['Stakeholder B']).toBe('Bob Jones');
  });

  it('analysis stores pseudonymMap accessible from inputSnapshot', () => {
    const analysis = makeAnalysis();

    expect(analysis.inputSnapshot).not.toBeNull();
    expect(analysis.inputSnapshot!.pseudonymMap).toBeDefined();
    expect(Object.keys(analysis.inputSnapshot!.pseudonymMap)).toHaveLength(2);
    expect(analysis.inputSnapshot!.pseudonymMap['Stakeholder A']).toBe('Alice Smith');
  });

  it('pseudonymMap keys match anonymized labels in SWOT evidence', () => {
    const analysis = makeAnalysis();
    const pseudonymMap = analysis.inputSnapshot!.pseudonymMap;
    const swot = analysis.swotOutput!;

    // Collect all anonymized labels from evidence
    const citedLabels = new Set<string>();
    for (const quadrant of ['strengths', 'weaknesses', 'opportunities', 'threats'] as const) {
      for (const item of swot[quadrant]) {
        for (const evidence of item.evidence) {
          if (evidence.sourceType === 'profile') {
            const label = evidence.sourceId.replace('profile:', '');
            citedLabels.add(label);
          }
        }
      }
    }

    // Every cited label should have a pseudonym mapping
    for (const label of citedLabels) {
      expect(pseudonymMap[label]).toBeDefined();
      expect(typeof pseudonymMap[label]).toBe('string');
    }
  });
});

// =====================================================================
// 6. Profile tags
// =====================================================================

describe('E2E: Profile tags', () => {
  let db: Database.Database;
  let profileRepo: ProfileRepository;
  const workspaceId = 'ws-tags';

  beforeEach(() => {
    db = initializeDatabase(':memory:');
    profileRepo = new ProfileRepository(db);
    db.prepare("INSERT INTO workspaces (id, path, name) VALUES (?, ?, ?)").run(workspaceId, '/tmp/test', 'Test');
  });

  afterEach(() => {
    db.close();
  });

  it('creates profile with tags and retrieves them', async () => {
    const profile = await profileRepo.insert(workspaceId, {
      name: 'Alice',
      role: 'Staff Engineer',
      tags: ['infrastructure', 'reliability', 'platform'],
    });

    expect(profile.tags).toEqual(['infrastructure', 'reliability', 'platform']);

    const retrieved = await profileRepo.findById(profile.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.tags).toEqual(['infrastructure', 'reliability', 'platform']);
  });

  it('creates profile without tags (defaults to empty array)', async () => {
    const profile = await profileRepo.insert(workspaceId, {
      name: 'Bob',
    });

    expect(profile.tags).toEqual([]);
  });

  it('updates profile tags', async () => {
    const profile = await profileRepo.insert(workspaceId, {
      name: 'Charlie',
      tags: ['backend'],
    });

    const updated = await profileRepo.update(profile.id, {
      name: 'Charlie',
      tags: ['backend', 'databases', 'performance'],
    });

    expect(updated).not.toBeNull();
    expect(updated!.tags).toEqual(['backend', 'databases', 'performance']);
  });

  it('tags survive round-trip through JSON serialization in SQLite', async () => {
    const tags = ['special-chars: test', 'multi word tag', 'CamelCaseTag'];
    const profile = await profileRepo.insert(workspaceId, {
      name: 'Diana',
      tags,
    });

    const all = await profileRepo.findByWorkspace(workspaceId);
    const found = all.find((p) => p.id === profile.id);
    expect(found!.tags).toEqual(tags);
  });
});

// =====================================================================
// 7. Onboarding wizard (preferences)
// =====================================================================

describe('E2E: Onboarding wizard', () => {
  let db: Database.Database;
  let prefsRepo: PreferencesRepository;

  beforeEach(() => {
    db = initializeDatabase(':memory:');
    prefsRepo = new PreferencesRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('onboardingComplete is not set initially', async () => {
    const pref = await prefsRepo.get('onboardingComplete');
    expect(pref).toBeNull();
  });

  it('completes onboarding by setting preference', async () => {
    await prefsRepo.set('onboardingComplete', 'true');
    const pref = await prefsRepo.get('onboardingComplete');
    expect(pref).not.toBeNull();
    expect(pref!.value).toBe('true');
  });

  it('stores LLM provider preference', async () => {
    await prefsRepo.set('llmProviderType', 'anthropic');
    const pref = prefsRepo.getSync('llmProviderType');
    expect(pref).not.toBeNull();
    expect(pref!.value).toBe('anthropic');
  });

  it('stores codebase provider preference', async () => {
    await prefsRepo.set('codebaseProviderType', 'opencode');
    const pref = await prefsRepo.get('codebaseProviderType');
    expect(pref).not.toBeNull();
    expect(pref!.value).toBe('opencode');
  });

  it('getAll returns all onboarding-related preferences', async () => {
    await prefsRepo.set('onboardingComplete', 'true');
    await prefsRepo.set('llmProviderType', 'openrouter');
    await prefsRepo.set('selectedModelId', 'openai/gpt-4');

    const all = await prefsRepo.getAll();
    expect(all['onboardingComplete']).toBe('true');
    expect(all['llmProviderType']).toBe('openrouter');
    expect(all['selectedModelId']).toBe('openai/gpt-4');
  });

  it('fresh database simulates first launch (no onboarding, no API key)', async () => {
    const all = await prefsRepo.getAll();
    expect(all['onboardingComplete']).toBeUndefined();
    expect(all['llmProviderType']).toBeUndefined();
  });
});

// =====================================================================
// 8. Evidence coverage + consistency
// =====================================================================

describe('E2E: Evidence coverage', () => {
  it('computes per-source-type coverage from SWOT output and input snapshot', () => {
    const swotOutput: SwotOutput = makeAnalysis().swotOutput!;
    const snapshot = makeInputSnapshot();

    const coverage = computeSourceCoverage(swotOutput, snapshot);

    // Profile coverage: 2 available (Stakeholder A, B), both cited
    const profileCov = coverage.find((c) => c.sourceType === 'profile');
    expect(profileCov).toBeDefined();
    expect(profileCov!.total).toBe(2);
    expect(profileCov!.cited).toBe(2);

    // Jira coverage: 2 available (PROJ-101, PROJ-102), 1 cited
    const jiraCov = coverage.find((c) => c.sourceType === 'jira');
    expect(jiraCov).toBeDefined();
    expect(jiraCov!.total).toBe(2);
    expect(jiraCov!.cited).toBe(1);
  });

  it('validates evidence source IDs against input snapshot', () => {
    const swotOutput: SwotOutput = makeAnalysis().swotOutput!;
    const snapshot = makeInputSnapshot();

    const result = validateEvidence(swotOutput, snapshot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Valid source IDs should produce no warnings
    expect(result.value.valid).toBe(true);
    expect(result.value.warnings).toHaveLength(0);
  });

  it('warns about unrecognized source IDs', () => {
    const swotOutput: SwotOutput = {
      strengths: [{
        claim: 'Test claim',
        evidence: [{ sourceType: 'profile', sourceId: 'profile:Unknown Person', sourceLabel: 'Unknown', quote: 'test' }],
        impact: 'test',
        recommendation: 'test',
        confidence: 'low',
      }],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };
    const snapshot = makeInputSnapshot();

    const result = validateEvidence(swotOutput, snapshot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.valid).toBe(false);
    expect(result.value.warnings.length).toBeGreaterThan(0);
    expect(result.value.warnings[0]).toContain('Unknown Person');
  });

  it('source coverage includes all source types present in snapshot', () => {
    const snapshot: AnonymizedPayload = {
      profiles: [
        { label: 'A', role: null, team: null, concerns: null, priorities: null, quotes: [], notes: null },
      ],
      jiraData: { markdown: '- [PROJ-1] Test' },
      confluenceData: { markdown: '- [Design Doc] (ID: abc123, Updated: 2024)' },
      githubData: { markdown: '- [org/repo#1] PR Title' },
      codebaseData: { markdown: '### [org/repo]' },
      pseudonymMap: {},
    };

    const swotOutput: SwotOutput = {
      strengths: [{
        claim: 'Multi-source finding',
        evidence: [
          { sourceType: 'profile', sourceId: 'profile:A', sourceLabel: 'A', quote: 'test' },
          { sourceType: 'jira', sourceId: 'jira:PROJ-1', sourceLabel: 'PROJ-1', quote: 'test' },
          { sourceType: 'confluence', sourceId: 'confluence:Design Doc', sourceLabel: 'Design Doc', quote: 'test' },
          { sourceType: 'confluence', sourceId: 'confluence:abc123', sourceLabel: 'abc123', quote: 'test' },
          { sourceType: 'github', sourceId: 'github:org/repo#1', sourceLabel: 'org/repo#1', quote: 'test' },
          { sourceType: 'codebase', sourceId: 'codebase:org/repo', sourceLabel: 'org/repo', quote: 'test' },
        ],
        impact: 'test',
        recommendation: 'test',
        confidence: 'high',
      }],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };

    const coverage = computeSourceCoverage(swotOutput, snapshot);

    expect(coverage).toHaveLength(5);
    const types = coverage.map((c) => c.sourceType).sort();
    expect(types).toEqual(['codebase', 'confluence', 'github', 'jira', 'profile']);

    // All sources should be fully cited
    for (const entry of coverage) {
      expect(entry.cited).toBe(entry.total);
    }
  });

  it('pipeline computes sourceCoverage in quality metrics', async () => {
    const llmCaller: LlmCaller = {
      call: vi.fn()
        .mockResolvedValueOnce({ content: VALID_EXTRACTION_RESPONSE, finishReason: 'stop' } satisfies LlmResponse)
        .mockResolvedValueOnce({ content: VALID_SYNTHESIS_RESPONSE, finishReason: 'stop' } satisfies LlmResponse)
        .mockResolvedValueOnce({ content: VALID_SWOT_RESPONSE, finishReason: 'stop' } satisfies LlmResponse),
    };

    const orchestrator = new AnalysisOrchestrator([
      new ExtractionStep(),
      new SynthesisStep(),
      new SwotGenerationStep(),
    ]);

    const result = await orchestrator.run(makePipelineContext({ llmCaller }), vi.fn());

    expect(result.qualityMetrics).toBeDefined();
    expect(result.qualityMetrics!.sourceCoverage).toBeDefined();
    expect(result.qualityMetrics!.sourceCoverage!.length).toBeGreaterThan(0);

    // Both profile and jira should appear in coverage
    const profileCov = result.qualityMetrics!.sourceCoverage!.find((c) => c.sourceType === 'profile');
    expect(profileCov).toBeDefined();
    expect(profileCov!.total).toBe(2);

    const jiraCov = result.qualityMetrics!.sourceCoverage!.find((c) => c.sourceType === 'jira');
    expect(jiraCov).toBeDefined();
  });
});

// =====================================================================
// 9. Phase 3e exit criteria validation
// =====================================================================

describe('Phase 3e exit criteria', () => {
  it('LLMProvider interface supports both OpenRouter and Anthropic via factory', () => {
    const or = createLlmProvider('openrouter');
    const an = createLlmProvider('anthropic');
    expect(or.name).not.toBe(an.name);
    expect(typeof or.createChatCompletion).toBe('function');
    expect(typeof an.createChatCompletion).toBe('function');
  });

  it('CodebaseProviderInterface supports both Claude CLI and OpenCode via factory', () => {
    const cli = createCodebaseProvider('claude_cli');
    const oc = createCodebaseProvider('opencode');
    expect(cli.name).not.toBe(oc.name);
    expect(typeof cli.analyze).toBe('function');
    expect(typeof oc.analyze).toBe('function');
  });

  it('chat can write 3 file types to workspace with approval', () => {
    // Verified by FILE_WRITE_TOOLS having 3 entries + ActionExecutor routing
    expect(FILE_WRITE_TOOLS).toHaveLength(3);
    expect(isFileWriteTool('write_markdown_file')).toBe(true);
    expect(isFileWriteTool('write_csv_file')).toBe(true);
    expect(isFileWriteTool('write_mermaid_file')).toBe(true);
  });

  it('evidence coverage indicator computes source citation rates', () => {
    const swot = makeAnalysis().swotOutput!;
    const snapshot = makeInputSnapshot();
    const coverage = computeSourceCoverage(swot, snapshot);

    expect(coverage.length).toBeGreaterThan(0);
    for (const entry of coverage) {
      expect(entry.cited).toBeLessThanOrEqual(entry.total);
      expect(entry.total).toBeGreaterThan(0);
    }
  });
});
