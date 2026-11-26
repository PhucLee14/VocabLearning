import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseCsvRecords } from '../words/import/csv.js';
import { type ImportWord, normalizeRecord, type ValidationError, validateWords } from '../words/import/import-format.js';
import { planImport, writeWords } from '../words/import/write-words.js';
import { IMPORT_MAX_ROWS } from './admin.dto.js';
import { AuditService } from './audit.service.js';

/** A preview can be committed for this long. */
const PREVIEW_TTL_MS = 60 * 60 * 1000;
/** Errors kept with the job and sent to the page. */
const MAX_ERRORS = 200;

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Parses a CSV or JSON import file into rows (400 when the file itself is unreadable). */
function parse(format: 'csv' | 'json', content: string): ImportWord[] {
  let records: Record<string, unknown>[];
  try {
    if (format === 'json') {
      const data = JSON.parse(content) as unknown;
      if (!Array.isArray(data)) throw new Error('a JSON import file must contain an array of words');
      records = data.map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : {}));
    } else {
      records = parseCsvRecords(content);
    }
  } catch (error) {
    throw new BadRequestException(`Can't read the file: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (records.length === 0) throw new BadRequestException('The file has no rows');
  if (records.length > IMPORT_MAX_ROWS) {
    throw new BadRequestException(`At most ${IMPORT_MAX_ROWS} rows per upload; use npm run words:import for more`);
  }
  return records.map(normalizeRecord);
}

/** How many rows have at least one error (a row can fail several rules). */
const failedRows = (errors: ValidationError[]) => new Set(errors.map((e) => e.index)).size;

/**
 * The import page's two steps: preview (parse, validate, count what would be
 * created and updated; nothing is written) and commit (the same file again,
 * checked against the preview's hash, then written as `words:import` does).
 */
@Injectable()
export class AdminImportService {
  private readonly logger = new Logger(AdminImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async preview(adminId: string, dto: { fileName: string; format: 'csv' | 'json'; content: string }) {
    const words = parse(dto.format, dto.content);
    const plan = await planImport(this.prisma, words);
    const errors = validateWords(words, new Set(plan.topicIds.keys()));
    const invalidRows = failedRows(errors);

    const job = await this.prisma.importJob.create({
      data: {
        fileName: `${dto.format}:${dto.fileName}`.slice(0, 200),
        status: 'PREVIEW',
        totalRows: words.length,
        failed: invalidRows,
        errors: errors.length ? (errors.slice(0, MAX_ERRORS) as unknown as Prisma.InputJsonValue) : undefined,
        contentHash: sha256(dto.content),
        createdById: adminId,
      },
      select: { id: true, createdAt: true },
    });

    return {
      id: job.id,
      fileName: dto.fileName,
      totalRows: words.length,
      creates: invalidRows ? null : plan.creates,
      updates: invalidRows ? null : plan.updates,
      invalidRows,
      errors: errors.slice(0, MAX_ERRORS),
      errorCount: errors.length,
      sample: words.slice(0, 8).map((w, i) => ({
        slug: plan.slugs[i],
        headword: w.headword,
        pos: w.pos,
        sense_no: w.sense_no,
        cefr_level: w.cefr_level,
        definition_en: w.definition_en,
        meaning_vi: w.meaning_vi ?? null,
        examples: w.examples.length,
        topics: w.topics,
      })),
      expiresAt: new Date(job.createdAt.getTime() + PREVIEW_TTL_MS),
    };
  }

  async commit(adminId: string, id: string, content: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('No such import');
    if (job.createdById !== adminId) throw new ForbiddenException('Only the admin who previewed this file can import it');
    if (job.status !== 'PREVIEW') throw new ConflictException('This import has already run');
    if (job.failed > 0) throw new BadRequestException('Fix the invalid rows and preview the file again');
    if (Date.now() - job.createdAt.getTime() > PREVIEW_TTL_MS) throw new ConflictException('The preview has expired; preview the file again');
    if (job.contentHash !== sha256(content)) throw new BadRequestException('This is not the file that was previewed');

    const format = job.fileName.startsWith('json:') ? 'json' : 'csv';
    const words = parse(format, content);
    const plan = await planImport(this.prisma, words);
    // Topics may have changed since the preview.
    const errors = validateWords(words, new Set(plan.topicIds.keys()));
    if (errors.length) throw new ConflictException('The data changed since the preview; preview the file again');

    // Claim the job first, so a double click can't run it twice.
    const claimed = await this.prisma.importJob.updateMany({
      where: { id, status: 'PREVIEW' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (claimed.count === 0) throw new ConflictException('This import has already run');

    try {
      await writeWords(this.prisma, words, plan);
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n').at(-1) : String(error);
      this.logger.error(`Import ${id} failed: ${message}`);
      await this.prisma.importJob.update({
        where: { id },
        data: { status: 'FAILED', errors: [{ index: -1, headword: '', message: 'The import stopped part-way; rows written before the error were kept.' }] },
      });
      throw error;
    }

    await this.prisma.importJob.update({ where: { id }, data: { inserted: plan.creates, updated: plan.updates } });
    await this.audit.record(
      adminId,
      'import.commit',
      { type: 'import', id, name: job.fileName.replace(/^(csv|json):/, '') },
      { rows: words.length, created: plan.creates, updated: plan.updates },
    );
    return { id, created: plan.creates, updated: plan.updates };
  }

  async history() {
    const jobs = await this.prisma.importJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        fileName: true,
        status: true,
        totalRows: true,
        inserted: true,
        updated: true,
        failed: true,
        createdAt: true,
        completedAt: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
    return jobs.map((j) => ({ ...j, fileName: j.fileName.replace(/^(csv|json):/, '') }));
  }
}
