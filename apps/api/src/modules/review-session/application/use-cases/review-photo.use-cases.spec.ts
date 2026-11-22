import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { InMemoryReviewTemplateRepository } from '../../../review-template/application/use-cases/testing/in-memory-review-template.repository';
import { ReviewTemplate } from '../../../review-template/domain/review-template.entity';
import { InMemoryInspectableElementRepository } from '../../../inspectable-element/application/use-cases/testing/in-memory-inspectable-element.repository';
import { InspectableElement } from '../../../inspectable-element/domain/inspectable-element.entity';
import { InspectableElementNotFoundError } from '../../../inspectable-element/domain/errors/inspectable-element-not-found.error';
import {
  jpegHeader,
  pngHeader,
} from '../../../organization-profile/domain/testing/logo-fixtures';
import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotEditableError } from '../../domain/errors/review-session-not-editable.error';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import {
  ReviewPhotoLimitReachedError,
  ReviewPhotoNotFoundError,
  ReviewPhotoTooLargeError,
  UnsupportedReviewPhotoFormatError,
} from '../../domain/errors/review-photo.errors';
import { REVIEW_PHOTO_MAX_BYTES } from '../../domain/review-photo';
import { SessionAccessService } from '../services/session-access.service';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { InMemoryReviewPhotoRepository } from './testing/in-memory-review-photo.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { UploadReviewPhotoUseCase } from './upload-review-photo.use-case';
import { ListReviewPhotosUseCase } from './list-review-photos.use-case';
import { ReadReviewPhotoUseCase } from './read-review-photo.use-case';
import { DeleteReviewPhotoUseCase } from './delete-review-photo.use-case';

const actor = { userId: 'user-1', role: 'MAINTENANCE_TECHNICIAN' as const };

function session(status: 'draft' | 'completed' = 'draft'): ReviewSession {
  return new ReviewSession({
    id: 'session-1',
    communityId: 'community-1',
    templateId: 'template-1',
    performedById: 'user-1',
    status,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: status === 'completed' ? new Date() : null,
  });
}

function element(overrides: Partial<InspectableElement> = {}) {
  return new InspectableElement({
    id: 'element-1',
    communityId: 'community-1',
    elementType: 'EXTINGUISHER',
    name: 'Extinguisher #1',
    description: null,
    location: 'Lobby',
    installedAt: new Date('2026-01-15'),
    serialNumber: null,
    deletedAt: null,
    code: 'X1',
    deactivatedAt: null,
    ...overrides,
  });
}

// EN-164 S1-S4 at the use-case level: scope through SessionAccess first,
// draft-only writes, JPEG by content, 2 MiB, 3 per element, files kept in
// step with rows.
describe('review photo use cases', () => {
  let sessions: InMemoryReviewSessionRepository;
  let photos: InMemoryReviewPhotoRepository;
  let files: InMemoryFileStorage;
  let elements: InMemoryInspectableElementRepository;
  let templates: InMemoryReviewTemplateRepository;
  let scope: FakeCommunityScopeChecker;
  let access: SessionAccessService;
  let ids: IdGenerator;
  let upload: UploadReviewPhotoUseCase;
  let list: ListReviewPhotosUseCase;
  let read: ReadReviewPhotoUseCase;
  let remove: DeleteReviewPhotoUseCase;

  beforeEach(() => {
    sessions = new InMemoryReviewSessionRepository();
    photos = new InMemoryReviewPhotoRepository(sessions);
    files = new InMemoryFileStorage();
    elements = new InMemoryInspectableElementRepository();
    templates = new InMemoryReviewTemplateRepository(
      new InMemoryChecklistQuestionRepository(),
    );
    scope = new FakeCommunityScopeChecker();
    access = new SessionAccessService(sessions, scope);
    let counter = 0;
    ids = { generate: () => `photo-${++counter}` };
    upload = new UploadReviewPhotoUseCase(
      access,
      templates,
      elements,
      photos,
      files,
      ids,
    );
    list = new ListReviewPhotosUseCase(access, templates, elements, photos);
    read = new ReadReviewPhotoUseCase(access, photos, files);
    remove = new DeleteReviewPhotoUseCase(access, photos, files);

    scope.assign('user-1', 'community-1');
    sessions.seed(session());
    templates.seed(
      new ReviewTemplate({
        id: 'template-1',
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        name: 'Quarterly checks',
        version: 1,
        status: 'active',
        draftQuestionIds: [],
        createdAt: new Date(),
        deletedAt: null,
      }),
      [{ questionId: 'question-1', order: 1, text: 'Is the seal intact?' }],
    );
    elements.seed(element());
  });

  describe('upload', () => {
    it('stores the file under a review-photos key and records the row', async () => {
      const result = await upload.execute(
        'session-1',
        'element-1',
        jpegHeader(),
        actor,
      );

      expect(result.id).toBe('photo-1');
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result).not.toHaveProperty('storageKey');
      expect(files.keys()).toEqual(['review-photos/photo-1.jpg']);
      const rows = photos.all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: 'photo-1',
        reviewSessionId: 'session-1',
        inspectableElementId: 'element-1',
        storageKey: 'review-photos/photo-1.jpg',
        sizeBytes: jpegHeader().length,
      });
    });

    it('accepts exactly 3 photos and rejects the 4th without leaving a file', async () => {
      for (let i = 0; i < 3; i++) {
        await upload.execute('session-1', 'element-1', jpegHeader(), actor);
      }

      await expect(
        upload.execute('session-1', 'element-1', jpegHeader(), actor),
      ).rejects.toBeInstanceOf(ReviewPhotoLimitReachedError);

      expect(photos.all()).toHaveLength(3);
      expect(files.keys()).toHaveLength(3);
    });

    it('counts per element: a second element still takes photos', async () => {
      elements.seed(element({ id: 'element-2', code: 'X2' }));
      for (let i = 0; i < 3; i++) {
        await upload.execute('session-1', 'element-1', jpegHeader(), actor);
      }

      await expect(
        upload.execute('session-1', 'element-2', jpegHeader(), actor),
      ).resolves.toBeDefined();
    });

    it('rejects a non-JPEG by content even with a JPEG-looking size, storing nothing', async () => {
      await expect(
        upload.execute('session-1', 'element-1', pngHeader(), actor),
      ).rejects.toBeInstanceOf(UnsupportedReviewPhotoFormatError);

      expect(photos.all()).toHaveLength(0);
      expect(files.keys()).toEqual([]);
    });

    it('rejects more than 2 MiB and accepts exactly 2 MiB', async () => {
      const header = jpegHeader();
      const atLimit = Buffer.concat([
        header,
        Buffer.alloc(REVIEW_PHOTO_MAX_BYTES - header.length),
      ]);
      await expect(
        upload.execute('session-1', 'element-1', atLimit, actor),
      ).resolves.toBeDefined();

      await expect(
        upload.execute(
          'session-1',
          'element-1',
          Buffer.concat([atLimit, Buffer.alloc(1)]),
          actor,
        ),
      ).rejects.toBeInstanceOf(ReviewPhotoTooLargeError);

      expect(photos.all()).toHaveLength(1);
      expect(files.keys()).toHaveLength(1);
    });

    it("hides another performer's session as not found", async () => {
      await expect(
        upload.execute('session-1', 'element-1', jpegHeader(), {
          userId: 'user-2',
          role: 'MAINTENANCE_TECHNICIAN',
        }),
      ).rejects.toBeInstanceOf(ReviewSessionNotFoundError);

      expect(files.keys()).toEqual([]);
    });

    it('rejects a completed session with ReviewSessionNotEditableError and stores nothing', async () => {
      await sessions.complete('session-1', new Date());

      await expect(
        upload.execute('session-1', 'element-1', jpegHeader(), actor),
      ).rejects.toBeInstanceOf(ReviewSessionNotEditableError);

      expect(photos.all()).toHaveLength(0);
      expect(files.keys()).toEqual([]);
    });

    it('never writes a file for a completed session (the draft check runs before the put)', async () => {
      await sessions.complete('session-1', new Date());
      const put = jest.spyOn(files, 'put');

      await expect(
        upload.execute('session-1', 'element-1', jpegHeader(), actor),
      ).rejects.toBeInstanceOf(ReviewSessionNotEditableError);

      expect(put).not.toHaveBeenCalled();
    });

    it('rejects an element outside the session community, deactivated or unknown as not found', async () => {
      elements.seed(
        element({
          id: 'element-other',
          communityId: 'community-2',
          code: 'X9',
        }),
      );
      elements.seed(
        element({
          id: 'element-gone',
          code: 'X8',
          deactivatedAt: new Date(),
        }),
      );

      for (const id of ['element-other', 'element-gone', 'unknown']) {
        await expect(
          upload.execute('session-1', id, jpegHeader(), actor),
        ).rejects.toBeInstanceOf(InspectableElementNotFoundError);
      }
      expect(files.keys()).toEqual([]);
    });

    it('deletes the stored file when the repository refuses (session completed after the load)', async () => {
      const racing = {
        ...photos,
        addToDraft: () => Promise.resolve('not_editable' as const),
      } as unknown as InMemoryReviewPhotoRepository;
      const racingUpload = new UploadReviewPhotoUseCase(
        access,
        templates,
        elements,
        racing,
        files,
        ids,
      );

      await expect(
        racingUpload.execute('session-1', 'element-1', jpegHeader(), actor),
      ).rejects.toBeInstanceOf(ReviewSessionNotEditableError);
      expect(files.keys()).toEqual([]);
    });

    it('deletes the stored file when the repository throws', async () => {
      const failing = {
        addToDraft: () => Promise.reject(new Error('db down')),
      } as unknown as InMemoryReviewPhotoRepository;
      const failingUpload = new UploadReviewPhotoUseCase(
        access,
        templates,
        elements,
        failing,
        files,
        ids,
      );

      await expect(
        failingUpload.execute('session-1', 'element-1', jpegHeader(), actor),
      ).rejects.toThrow('db down');
      expect(files.keys()).toEqual([]);
    });
  });

  describe('list', () => {
    it('lists id and createdAt only, oldest first, for the element', async () => {
      const first = await upload.execute(
        'session-1',
        'element-1',
        jpegHeader(),
        actor,
      );
      const second = await upload.execute(
        'session-1',
        'element-1',
        jpegHeader(),
        actor,
      );

      const result = await list.execute('session-1', 'element-1', actor);

      expect(result).toEqual([
        { id: first.id, createdAt: first.createdAt },
        { id: second.id, createdAt: second.createdAt },
      ]);
    });

    it('rejects an element outside the session community, deactivated or unknown as not found', async () => {
      elements.seed(
        element({
          id: 'element-other',
          communityId: 'community-2',
          code: 'X9',
        }),
      );
      elements.seed(
        element({ id: 'element-gone', code: 'X8', deactivatedAt: new Date() }),
      );

      for (const id of ['element-other', 'element-gone', 'unknown']) {
        await expect(
          list.execute('session-1', id, actor),
        ).rejects.toBeInstanceOf(InspectableElementNotFoundError);
      }
    });

    it('lists a completed session photos for its performer', async () => {
      const { id } = await upload.execute(
        'session-1',
        'element-1',
        jpegHeader(),
        actor,
      );
      await sessions.complete('session-1', new Date());

      const result = await list.execute('session-1', 'element-1', actor);

      expect(result.map((photo) => photo.id)).toEqual([id]);
    });

    it("hides another performer's session as not found", async () => {
      await expect(
        list.execute('session-1', 'element-1', {
          userId: 'user-2',
          role: 'MAINTENANCE_TECHNICIAN',
        }),
      ).rejects.toBeInstanceOf(ReviewSessionNotFoundError);
    });
  });

  describe('read', () => {
    it('returns the stored bytes', async () => {
      const content = jpegHeader();
      const { id } = await upload.execute(
        'session-1',
        'element-1',
        content,
        actor,
      );

      await expect(read.execute('session-1', id, actor)).resolves.toEqual(
        content,
      );
    });

    it('answers not found for an unknown photo, a photo of another session, and a missing file', async () => {
      const { id } = await upload.execute(
        'session-1',
        'element-1',
        jpegHeader(),
        actor,
      );
      await expect(
        read.execute('session-1', 'nope', actor),
      ).rejects.toBeInstanceOf(ReviewPhotoNotFoundError);

      sessions.seed(
        new ReviewSession({
          id: 'session-2',
          communityId: 'community-1',
          templateId: 'template-1',
          performedById: 'user-1',
          status: 'draft',
          startedAt: new Date(),
          completedAt: null,
        }),
      );
      await expect(read.execute('session-2', id, actor)).rejects.toBeInstanceOf(
        ReviewPhotoNotFoundError,
      );

      await files.delete('review-photos/photo-1.jpg');
      await expect(read.execute('session-1', id, actor)).rejects.toBeInstanceOf(
        ReviewPhotoNotFoundError,
      );
    });

    it("hides another performer's session as not found", async () => {
      const { id } = await upload.execute(
        'session-1',
        'element-1',
        jpegHeader(),
        actor,
      );
      await expect(
        read.execute('session-1', id, {
          userId: 'user-2',
          role: 'MAINTENANCE_TECHNICIAN',
        }),
      ).rejects.toBeInstanceOf(ReviewSessionNotFoundError);
    });
  });

  describe('delete', () => {
    it('removes the row and the file', async () => {
      const { id } = await upload.execute(
        'session-1',
        'element-1',
        jpegHeader(),
        actor,
      );

      await remove.execute('session-1', id, actor);

      expect(photos.all()).toHaveLength(0);
      expect(files.keys()).toEqual([]);
    });

    it('answers not found for an unknown photo', async () => {
      await expect(
        remove.execute('session-1', 'nope', actor),
      ).rejects.toBeInstanceOf(ReviewPhotoNotFoundError);
    });

    it('rejects a completed session and keeps row and file', async () => {
      const { id } = await upload.execute(
        'session-1',
        'element-1',
        jpegHeader(),
        actor,
      );
      await sessions.complete('session-1', new Date());

      await expect(
        remove.execute('session-1', id, actor),
      ).rejects.toBeInstanceOf(ReviewSessionNotEditableError);

      expect(photos.all()).toHaveLength(1);
      expect(files.keys()).toEqual(['review-photos/photo-1.jpg']);
    });

    it('still succeeds when the file delete fails (logged, not thrown)', async () => {
      const { id } = await upload.execute(
        'session-1',
        'element-1',
        jpegHeader(),
        actor,
      );
      jest.spyOn(files, 'delete').mockRejectedValueOnce(new Error('disk gone'));

      await expect(
        remove.execute('session-1', id, actor),
      ).resolves.toBeUndefined();
      expect(photos.all()).toHaveLength(0);
    });
  });
});
