export function buildCodebaseAnalysisPrompt(
  repoFullName: string,
  jiraAvailable: boolean,
  jiraProjectHints: string[],
): string {
  const jiraSection = jiraAvailable
    ? `
## Jira Cross-Reference

Use the Jira MCP tools to search for issues related to code patterns you find.
- Search for issues mentioning file paths, module names, or error patterns
- Correlate code hotspots with open bugs or in-progress stories
- Projects to search: ${jiraProjectHints.length > 0 ? jiraProjectHints.join(', ') : 'any'}

Include your Jira findings in the "jiraCrossReference" section of the output.`
    : '';

  const jiraOutputNote = jiraAvailable
    ? '"jiraCrossReference": { "summary": "...", "correlations": ["..."] }'
    : '"jiraCrossReference": null';

  return `You are analyzing the codebase at the current working directory for the repository: ${repoFullName}

Your task is to produce a structured analysis of this codebase for an organizational SWOT analysis. Use the Read, Glob, Grep, and Bash tools to explore the code thoroughly.

## Instructions

1. Start by understanding the project structure (Glob for key files, read README, package.json or equivalent, etc.)
2. Assess architecture patterns and module boundaries
3. Evaluate code quality signals (tests, error handling, type safety)
4. Identify technical debt (TODOs, deprecated deps, complexity hotspots)
5. Assess delivery risks (churn via git log, untested hotspots, dependency health)
${jiraSection}

## Rules

- Only report findings you can cite with specific file paths, line numbers, or git log output.
- Do not speculate about business logic or organizational context — that comes from other data sources.
- Be concise. Each finding should be 1-3 sentences with a specific file/module reference.
- Exclude .env, credentials, secrets, and PII from your output.
- Skip these paths: node_modules/, vendor/, dist/, build/, .git/, *.lock

## Output Format

Respond with ONLY a JSON object wrapped in a \`\`\`json code fence. The JSON must conform to this schema:

\`\`\`json
{
  "repo": "${repoFullName}",
  "analyzedAt": "<current ISO timestamp>",
  "architecture": {
    "summary": "Markdown summary of architecture patterns and structure",
    "modules": ["list of top-level modules or services discovered"],
    "concerns": ["specific architectural concerns with file path references"]
  },
  "quality": {
    "summary": "Markdown summary of code quality patterns",
    "strengths": ["well-tested areas, good patterns with file references"],
    "weaknesses": ["untested areas, inconsistent patterns with file references"]
  },
  "technicalDebt": {
    "summary": "Markdown summary of tech debt landscape",
    "items": [
      {
        "description": "What the debt is",
        "location": "file path or module name",
        "severity": "high | medium | low",
        "evidence": "Specific code snippet, comment, or metric"
      }
    ]
  },
  "risks": {
    "summary": "Markdown summary of delivery and dependency risks",
    "items": ["specific risk with supporting evidence"]
  },
  ${jiraOutputNote}
}
\`\`\`

Do not include any text before or after the JSON code fence.`;
}
