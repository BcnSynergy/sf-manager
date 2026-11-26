// Port (application layer). EN-243: the orphan signature file sweep, run by
// review-session's ReviewFileSweepScheduler so every orphan file sweep shares
// one schedule. Bound in reviewer-signature.module.ts via
// `useExisting: SweepOrphanSignatureFilesUseCase` and exported without the
// repository.
export interface OrphanSignatureFileSweep {
  // Resolves how many orphan files under signatures/ were deleted.
  execute(): Promise<number>;
}

export const ORPHAN_SIGNATURE_FILE_SWEEP = Symbol(
  'ORPHAN_SIGNATURE_FILE_SWEEP',
);
