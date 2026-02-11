import { describe, it, expect } from 'vitest';
import { buildCodebaseAnalysisPrompt } from './codebase-prompt';

describe('buildCodebaseAnalysisPrompt', () => {
  it('includes repo name in prompt', () => {
    const prompt = buildCodebaseAnalysisPrompt('org/my-repo', false, []);
    expect(prompt).toContain('org/my-repo');
  });

  it('includes Jira section when jiraAvailable is true', () => {
    const prompt = buildCodebaseAnalysisPrompt('org/repo', true, ['PROJ', 'TEAM']);
    expect(prompt).toContain('Jira Cross-Reference');
    expect(prompt).toContain('PROJ, TEAM');
    expect(prompt).toContain('jiraCrossReference');
    expect(prompt).not.toContain('"jiraCrossReference": null');
  });

  it('excludes Jira section when jiraAvailable is false', () => {
    const prompt = buildCodebaseAnalysisPrompt('org/repo', false, []);
    expect(prompt).not.toContain('Jira Cross-Reference');
    expect(prompt).toContain('"jiraCrossReference": null');
  });

  it('includes git history section when fullClone is true', () => {
    const prompt = buildCodebaseAnalysisPrompt('org/repo', false, [], true);
    expect(prompt).toContain('Git History Analysis');
    expect(prompt).toContain('git log --stat');
    expect(prompt).toContain('git shortlog');
    expect(prompt).toContain('git blame');
  });

  it('excludes git history section when fullClone is false', () => {
    const prompt = buildCodebaseAnalysisPrompt('org/repo', false, [], false);
    expect(prompt).not.toContain('Git History Analysis');
  });

  it('includes both Jira and git history sections when both are enabled', () => {
    const prompt = buildCodebaseAnalysisPrompt('org/repo', true, ['PROJ'], true);
    expect(prompt).toContain('Jira Cross-Reference');
    expect(prompt).toContain('Git History Analysis');
  });

  it('includes evidence rules section', () => {
    const prompt = buildCodebaseAnalysisPrompt('org/repo', false, []);
    expect(prompt).toContain('Evidence Rules');
    expect(prompt).toContain('MUST cite a specific file path');
  });

  it('includes analysis strategy section', () => {
    const prompt = buildCodebaseAnalysisPrompt('org/repo', false, []);
    expect(prompt).toContain('Analysis Strategy');
    expect(prompt).toContain('Discover structure');
    expect(prompt).toContain('Map architecture');
  });

  it('includes JSON schema with correct repo name', () => {
    const prompt = buildCodebaseAnalysisPrompt('my-org/special-repo', false, []);
    expect(prompt).toContain('"repo": "my-org/special-repo"');
  });

  it('handles empty jiraProjectHints', () => {
    const prompt = buildCodebaseAnalysisPrompt('org/repo', true, []);
    expect(prompt).toContain('Projects to search: any');
  });
});
