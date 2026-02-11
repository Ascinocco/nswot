import PDFDocument from 'pdfkit';
import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { Analysis, SwotItem, AnalysisProfile } from '../domain/types';
import type { AnalysisRepository } from '../repositories/analysis.repository';

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  staff_engineer: 'Staff Engineer',
  senior_em: 'Senior Engineering Manager',
  vp_engineering: 'VP of Engineering',
};

function formatRole(role: string): string {
  return ROLE_DISPLAY_NAMES[role] ?? role;
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return 'Unknown';
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export class ExportService {
  constructor(private readonly analysisRepo: AnalysisRepository) {}

  private async loadCompletedAnalysis(
    analysisId: string,
  ): Promise<Result<{ analysis: Analysis; profiles: AnalysisProfile[] }, DomainError>> {
    const analysis = await this.analysisRepo.findById(analysisId);
    if (!analysis) {
      return err(
        new DomainError(ERROR_CODES.INTERNAL_ERROR, `Analysis "${analysisId}" not found`),
      );
    }
    if (analysis.status !== 'completed' || !analysis.swotOutput) {
      return err(
        new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Analysis is not completed'),
      );
    }
    const profiles = await this.analysisRepo.findProfiles(analysisId);
    return ok({ analysis, profiles });
  }

  async exportMarkdown(analysisId: string): Promise<Result<string, DomainError>> {
    try {
      const loaded = await this.loadCompletedAnalysis(analysisId);
      if (!loaded.ok) return loaded;
      const { analysis, profiles } = loaded.value;
      const markdown = buildMarkdown(analysis, profiles);
      return ok(markdown);
    } catch (cause) {
      if (cause instanceof DomainError) return err(cause);
      return err(
        new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to export analysis', cause),
      );
    }
  }

  async exportCSV(analysisId: string): Promise<Result<string, DomainError>> {
    try {
      const loaded = await this.loadCompletedAnalysis(analysisId);
      if (!loaded.ok) return loaded;
      const { analysis } = loaded.value;
      const csv = buildCSV(analysis);
      return ok(csv);
    } catch (cause) {
      if (cause instanceof DomainError) return err(cause);
      return err(
        new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to export CSV', cause),
      );
    }
  }

  async exportPDF(analysisId: string): Promise<Result<Buffer, DomainError>> {
    try {
      const loaded = await this.loadCompletedAnalysis(analysisId);
      if (!loaded.ok) return loaded;
      const { analysis, profiles } = loaded.value;
      const buffer = await buildPDF(analysis, profiles);
      return ok(buffer);
    } catch (cause) {
      if (cause instanceof DomainError) return err(cause);
      return err(
        new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Failed to export PDF', cause),
      );
    }
  }
}

// --- CSV ---

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCSV(analysis: Analysis): string {
  const headers = ['quadrant', 'claim', 'confidence', 'evidence_count', 'recommendation', 'sources'];
  const rows: string[] = [headers.join(',')];
  const swot = analysis.swotOutput!;

  const quadrants: Array<{ name: string; items: SwotItem[] }> = [
    { name: 'Strengths', items: swot.strengths },
    { name: 'Weaknesses', items: swot.weaknesses },
    { name: 'Opportunities', items: swot.opportunities },
    { name: 'Threats', items: swot.threats },
  ];

  for (const { name, items } of quadrants) {
    for (const item of items) {
      const sources = item.evidence.map((e) => e.sourceId).join('; ');
      rows.push(
        [
          escapeCSV(name),
          escapeCSV(item.claim),
          escapeCSV(item.confidence),
          String(item.evidence.length),
          escapeCSV(item.recommendation),
          escapeCSV(sources),
        ].join(','),
      );
    }
  }

  return rows.join('\n');
}

// --- PDF ---

async function buildPDF(analysis: Analysis, profiles: AnalysisProfile[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const role = formatRole(analysis.role);
    const date = formatDate(analysis.completedAt);

    // Title
    doc.fontSize(20).font('Helvetica-Bold').text('SWOT Analysis', { align: 'center' });
    doc.moveDown(0.5);

    // Metadata
    doc.fontSize(10).font('Helvetica');
    doc.text(`Date: ${date}  |  Role: ${role}  |  Model: ${analysis.modelId}  |  Profiles: ${profiles.length} stakeholders`);
    doc.moveDown(0.5);

    if (analysis.warning) {
      doc.fontSize(9).font('Helvetica-Oblique').text(`Warning: ${analysis.warning}`);
      doc.moveDown(0.5);
    }

    // Summaries
    if (analysis.summariesOutput) {
      doc.fontSize(14).font('Helvetica-Bold').text('Executive Summary');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').text(analysis.summariesOutput.profiles, { width: 500 });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').text(analysis.summariesOutput.jira, { width: 500 });
      doc.moveDown(0.5);
    }

    // SWOT Quadrants
    const swot = analysis.swotOutput!;
    addPDFQuadrant(doc, 'Strengths', swot.strengths);
    addPDFQuadrant(doc, 'Weaknesses', swot.weaknesses);
    addPDFQuadrant(doc, 'Opportunities', swot.opportunities);
    addPDFQuadrant(doc, 'Threats', swot.threats);

    // Footer
    doc.moveDown(1);
    doc.fontSize(8).font('Helvetica-Oblique').text('Generated by nswot', { align: 'center' });

    doc.end();
  });
}

function addPDFQuadrant(doc: PDFKit.PDFDocument, title: string, items: SwotItem[]): void {
  doc.fontSize(14).font('Helvetica-Bold').text(title);
  doc.moveDown(0.3);

  if (items.length === 0) {
    doc.fontSize(10).font('Helvetica-Oblique').text('No items identified.');
    doc.moveDown(0.5);
    return;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const badge = item.confidence.toUpperCase();

    doc.fontSize(11).font('Helvetica-Bold').text(`${i + 1}. ${item.claim} [${badge}]`);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Impact: ${item.impact}`, { width: 500 });
    doc.text(`Recommendation: ${item.recommendation}`, { width: 500 });

    if (item.evidence.length > 0) {
      doc.text('Evidence:', { width: 500 });
      for (const e of item.evidence) {
        doc.text(`  - [${e.sourceId}] "${e.quote}"`, { width: 490 });
      }
    }
    doc.moveDown(0.3);
  }

  doc.moveDown(0.3);
}

// --- Markdown ---

function buildMarkdown(analysis: Analysis, profiles: AnalysisProfile[]): string {
  const sections: string[] = [];
  const role = formatRole(analysis.role);
  const date = formatDate(analysis.completedAt);

  // Header
  sections.push(`# SWOT Analysis

| Field | Value |
|-------|-------|
| **Date** | ${date} |
| **Role** | ${role} |
| **Model** | ${analysis.modelId} |
| **Profiles** | ${profiles.length} stakeholders |`);

  if (analysis.warning) {
    sections.push(`\n> **Warning:** ${analysis.warning}`);
  }

  // Summaries
  if (analysis.summariesOutput) {
    sections.push(`\n---\n\n## Executive Summary\n\n### Stakeholder Themes\n\n${analysis.summariesOutput.profiles}\n\n### Jira Patterns\n\n${analysis.summariesOutput.jira}`);
  }

  // SWOT Quadrants
  const swot = analysis.swotOutput!;
  sections.push('\n---\n');

  sections.push(formatQuadrant('Strengths', swot.strengths));
  sections.push(formatQuadrant('Weaknesses', swot.weaknesses));
  sections.push(formatQuadrant('Opportunities', swot.opportunities));
  sections.push(formatQuadrant('Threats', swot.threats));

  // Stakeholder key
  if (profiles.length > 0) {
    sections.push('---\n\n## Stakeholder Key\n');
    sections.push(
      '| Label | Role |',
      '|-------|------|',
    );
    for (const p of profiles) {
      sections.push(`| ${p.anonymizedLabel} | — |`);
    }
  }

  // Footer
  sections.push(
    '\n---\n\n*Generated by nswot*',
  );

  return sections.join('\n');
}

function formatQuadrant(title: string, items: SwotItem[]): string {
  const sections: string[] = [`## ${title}\n`];

  if (items.length === 0) {
    sections.push('*No items identified.*\n');
    return sections.join('\n');
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const badge = confidenceBadge(item.confidence);

    sections.push(`### ${i + 1}. ${item.claim} ${badge}\n`);
    sections.push(`**Impact:** ${item.impact}\n`);
    sections.push(`**Recommendation:** ${item.recommendation}\n`);

    if (item.evidence.length > 0) {
      sections.push('**Evidence:**\n');
      for (const e of item.evidence) {
        sections.push(`- \\[${e.sourceId}\\] "${e.quote}"`);
      }
      sections.push('');
    }
  }

  return sections.join('\n');
}

function confidenceBadge(confidence: string): string {
  switch (confidence) {
    case 'high':
      return '`HIGH`';
    case 'medium':
      return '`MEDIUM`';
    case 'low':
      return '`LOW`';
    default:
      return `\`${confidence.toUpperCase()}\``;
  }
}
