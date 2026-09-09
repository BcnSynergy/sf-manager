import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { mapApiErrorToMessageKey } from './error-messages';

describe('mapApiErrorToMessageKey (review-session)', () => {
  it('maps each known error code to its own key', () => {
    const cases: Array<[string, string]> = [
      ['COMMUNITY_NOT_IN_SCOPE', 'reviewSession.error.communityNotInScope'],
      ['ACTIVE_TEMPLATE_NOT_FOUND', 'reviewSession.error.activeTemplateNotFound'],
      ['OPEN_DRAFT_ALREADY_EXISTS', 'reviewSession.error.openDraftAlreadyExists'],
      ['REVIEW_SESSION_NOT_FOUND', 'reviewSession.error.sessionNotFound'],
      ['REVIEW_SESSION_NOT_EDITABLE', 'reviewSession.error.sessionNotEditable'],
      ['ELEMENT_NOT_FOUND', 'reviewSession.error.elementNotFound'],
      ['ANSWERS_DO_NOT_MATCH_TEMPLATE', 'reviewSession.error.answersDoNotMatchTemplate'],
      ['MISSING_OBSERVATIONS', 'reviewSession.error.missingObservations'],
      ['MISSING_ANSWERS', 'reviewSession.error.missingAnswers'],
      [
        'UNREVIEWED_ELEMENTS_WITHOUT_REASON',
        'reviewSession.error.unreviewedElementsWithoutReason',
      ],
    ];

    for (const [code, key] of cases) {
      expect(mapApiErrorToMessageKey(new ApiError(409, code))).toBe(key);
    }
  });

  // review-session-ui spec "Rejected Codes Get One Uniform Message": every
  // rejection cause a resolved code can fail for is already collapsed
  // server-side to the single ELEMENT_NOT_FOUND code (design.md
  // Decision 6) — this asserts the client mapper does not reintroduce a
  // distinction by keying off `.message` (which differs per cause on the
  // server) instead of `.code`.
  it('the same ELEMENT_NOT_FOUND code maps to the same message regardless of the server .message text', () => {
    const unknown = new ApiError(404, 'ELEMENT_NOT_FOUND');
    const foreignCommunity = new ApiError(404, 'ELEMENT_NOT_FOUND');
    Object.defineProperty(foreignCommunity, 'message', {
      value: 'This code belongs to another community',
    });
    const decommissioned = new ApiError(404, 'ELEMENT_NOT_FOUND');
    Object.defineProperty(decommissioned, 'message', {
      value: 'This element has been decommissioned',
    });

    const keys = new Set([
      mapApiErrorToMessageKey(unknown),
      mapApiErrorToMessageKey(foreignCommunity),
      mapApiErrorToMessageKey(decommissioned),
    ]);

    expect(keys.size).toBe(1);
  });

  // review-history spec + design.md D1/D3: every cause a completed-session
  // read can fail for — unknown id, a draft (never completed), another
  // performer's session, another community's session — is collapsed
  // server-side to the SAME REVIEW_SESSION_NOT_FOUND code (one
  // ReviewSessionNotFoundError throw site). Mirrors the ELEMENT_NOT_FOUND
  // test above: the mapper must key off `.code` only, never `.message`
  // (which differs per cause on the server), so all four causes render the
  // identical message in ReviewHistoryDetailPage.
  it('the same REVIEW_SESSION_NOT_FOUND code maps to the same message across every unreachable-session cause', () => {
    const nonexistent = new ApiError(404, 'REVIEW_SESSION_NOT_FOUND');
    const draft = new ApiError(404, 'REVIEW_SESSION_NOT_FOUND');
    Object.defineProperty(draft, 'message', {
      value: 'This session has not been completed yet',
    });
    const foreignPerformer = new ApiError(404, 'REVIEW_SESSION_NOT_FOUND');
    Object.defineProperty(foreignPerformer, 'message', {
      value: 'This session belongs to another performer',
    });
    const foreignCommunity = new ApiError(404, 'REVIEW_SESSION_NOT_FOUND');
    Object.defineProperty(foreignCommunity, 'message', {
      value: 'This session belongs to another community',
    });

    const keys = new Set([
      mapApiErrorToMessageKey(nonexistent),
      mapApiErrorToMessageKey(draft),
      mapApiErrorToMessageKey(foreignPerformer),
      mapApiErrorToMessageKey(foreignCommunity),
    ]);

    expect(keys.size).toBe(1);
  });

  it('maps a 400 with no code to reviewSession.error.validationFailed', () => {
    expect(mapApiErrorToMessageKey(new ApiError(400))).toBe(
      'reviewSession.error.validationFailed',
    );
  });

  it('maps status 0 (network/parse failure) to common.error.network', () => {
    expect(mapApiErrorToMessageKey(new ApiError(0))).toBe('common.error.network');
  });

  it('maps an unrecognized status/code combination to common.error.network', () => {
    expect(mapApiErrorToMessageKey(new ApiError(409, 'SOMETHING_UNKNOWN' as never))).toBe(
      'common.error.network',
    );
  });
});
