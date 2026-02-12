import type { AnalysisDepth } from './codebase.types';

export function buildCodebaseAnalysisPrompt(
  repoFullName: string,
  jiraAvailable: boolean,
  jiraProjectHints: string[],
  fullClone: boolean = false,
  depth: AnalysisDepth = 'standard',
): string {
  const jiraSection = jiraAvailable
    ? `
## Jira Cross-Reference

Use the Jira MCP tools to search for issues related to code patterns you find.
- Search for issues mentioning file paths, module names, or error patterns you discovered
- Correlate code hotspots (high churn, low coverage) with open bugs or in-progress stories
- Look for issues that reference TODO/FIXME comments you find in the code
- Projects to search: ${jiraProjectHints.length > 0 ? jiraProjectHints.join(', ') : 'any'}

Include your Jira findings in the "jiraCrossReference" section of the output. Each correlation should reference both the code location and the Jira issue key.`
    : '';

  const jiraOutputNote = jiraAvailable
    ? '"jiraCrossReference": { "summary": "...", "correlations": ["PROJ-123: auth module test gaps correlate with open bug about login failures (src/auth/login.ts)"] }'
    : '"jiraCrossReference": null';

  const gitHistorySection = fullClone
    ? `
## Git History Analysis (Full Clone Available)

Full commit history is available. Use git commands to perform deep analysis:
- \`git log --stat --since="6 months ago"\` — identify high-churn files
- \`git shortlog -sn\` — identify contributor distribution and bus factor
- \`git log --follow <file>\` — trace file rename/refactor history
- \`git log --diff-filter=D --name-only\` — find deleted files (abandoned work)
- \`git blame <file>\` — identify code ownership and age of critical sections

Focus on: files with high change frequency but low test coverage, single-maintainer modules, and recent architectural changes.`
    : '';

  const timeBudget = depth === 'deep'
    ? `
## Time Budget

You have approximately 60 minutes to complete this analysis. Plan your time accordingly:
- Spend up to 40 minutes on thorough exploration (steps 1-5 above)
- Reserve at least 10 minutes to compile and write your structured JSON output
- Go deep on each section — follow interesting leads, trace dependency chains, read key files in full
- If you are still exploring after 45 minutes, stop and write output with the evidence you have so far`
    : `
## Time Budget — CRITICAL

You have a HARD LIMIT of 20 minutes. You MUST output your JSON before then.
- Spend no more than 12 minutes on exploration (steps 1-5 above)
- At 12 minutes, STOP exploring and START writing your JSON output immediately
- Prioritize BREADTH over depth — get basic findings for ALL sections rather than going deep on one area
- One pass through each section is enough. Do not revisit or re-read files.
- If a section has no obvious findings after 2 minutes, write an empty array and move on
- YOUR OUTPUT IS MORE VALUABLE THAN MORE EXPLORATION. Write what you have.`;

  return `You are analyzing the codebase at the current working directory for the repository: ${repoFullName}

Your task is to produce a structured analysis of this codebase for an organizational SWOT analysis. A staff engineer will use these findings as evidence for strengths, weaknesses, opportunities, and threats. Use the Read, Glob, Grep, and Bash tools to explore the code thoroughly.

## Analysis Strategy

1. **Discover structure**: Glob for key files (README*, package.json, Cargo.toml, go.mod, pom.xml, etc.). Read the main config to understand the tech stack, build system, and entry points.
2. **Map architecture**: Identify top-level modules, service boundaries, and dependency direction. Look for layering patterns, shared libraries, and API surfaces.
3. **Assess quality**: Search for test files (Glob for *.test.*, *_test.*, *_spec.*), measure test-to-source ratio. Grep for error handling patterns, type safety indicators, and linting config.
4. **Find tech debt**: Grep for TODO, FIXME, HACK, XXX, @deprecated. Check dependency freshness (lockfile dates, known CVE patterns). Look for large files (>500 lines) as complexity hotspots.
5. **Evaluate delivery risks**: Use git log to find churn hotspots. Cross-reference high-churn files with test coverage. Check CI/CD config health.
${gitHistorySection}
${jiraSection}
${timeBudget}

## Evidence Rules

- Every finding MUST cite a specific file path, line range, git log output, or grep result.
- Do NOT speculate about business context, team dynamics, or organizational priorities — that comes from other data sources.
- Prefer concrete metrics over vague assessments: "47 TODO comments in src/auth/" is better than "some technical debt exists."
- Each array item should be 1-3 sentences with at least one specific reference.
- If you cannot find evidence for a category, return an empty array — do not fabricate findings.
- Skip: node_modules/, vendor/, dist/, build/, .git/, *.lock, .env*, *.min.js

## Output Format

Respond with ONLY a JSON object wrapped in a \`\`\`json code fence. No text before or after. The JSON must match this exact schema:

\`\`\`json
{
  "repo": "${repoFullName}",
  "analyzedAt": "<current ISO 8601 timestamp>",
  "architecture": {
    "summary": "2-4 sentence markdown summary of architecture patterns",
    "modules": ["top-level module or service names"],
    "concerns": ["specific concern with file path — e.g. 'Circular dependency between src/api/ and src/core/ via shared types'"]
  },
  "quality": {
    "summary": "2-4 sentence markdown summary of code quality",
    "strengths": ["strength with evidence — e.g. '93% test coverage in src/core/ (47 test files for 51 source files)'"],
    "weaknesses": ["weakness with evidence — e.g. 'No tests for src/api/middleware/ (0 test files, 12 source files)'"]
  },
  "technicalDebt": {
    "summary": "2-4 sentence markdown summary of tech debt landscape",
    "items": [
      {
        "description": "What the debt is",
        "location": "file path or module name",
        "severity": "high | medium | low",
        "evidence": "Specific code snippet, grep result, or metric"
      }
    ]
  },
  "risks": {
    "summary": "2-4 sentence markdown summary of delivery and dependency risks",
    "items": ["specific risk with evidence — e.g. 'lodash@3.10.1 is 8 major versions behind and has 3 known CVEs'"]
  },
  ${jiraOutputNote}
}
\`\`\`

Do not include any text before or after the JSON code fence.`;
}
