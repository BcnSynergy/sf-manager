import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { DraftSelectionCleaner } from '../../application/ports/draft-selection-cleaner.port';

// Prisma adapter for the DraftSelectionCleaner port (design.md Decision 6),
// owned entirely by `checklist-question` — talks to the `"ReviewTemplate"`
// table directly via raw SQL over `PrismaService` (`@Global()` PrismaModule,
// so no module import is needed at all), never through review-template's
// own repository. This is what keeps the Nest DI graph acyclic without
// `forwardRef()`. A ~12-line cleanup probe, not a repository — mirrors
// `PrismaInspectableElementCounter` exactly.
//
// `array_remove` strips the id from every DRAFT row's ordered selection in
// one statement; frozen (`active`/`retired`) rows are untouched by
// construction (`draftQuestionIds` is reset to `'{}'` at activation, design
// Decision 2) — the `"status" = 'draft'` filter is belt-and-braces, not
// load-bearing on its own.
@Injectable()
export class PrismaDraftSelectionCleaner implements DraftSelectionCleaner {
  constructor(private readonly prisma: PrismaService) {}

  async removeQuestionFromDrafts(questionId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "ReviewTemplate"
      SET "draftQuestionIds" = array_remove("draftQuestionIds", ${questionId}::uuid)
      WHERE "status" = 'draft' AND ${questionId}::uuid = ANY("draftQuestionIds")
    `;
  }
}
