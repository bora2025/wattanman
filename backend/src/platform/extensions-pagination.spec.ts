import { decodeDateIdCursor } from '../common/cursor-pagination';
import { ExtensionsService } from './extensions.service';

describe('ExtensionsService secondary collection pagination', () => {
  const publisherRows = [
    { id: 'publisher-2', createdAt: new Date('2026-02-02') },
    { id: 'publisher-1', createdAt: new Date('2026-02-01') },
  ];
  const keyRows = [
    { id: 'key-2', createdAt: new Date('2026-02-02') },
    { id: 'key-1', createdAt: new Date('2026-02-01') },
  ];
  const prisma = {
    extensionPublisher: { findMany: jest.fn().mockResolvedValue(publisherRows) },
    extensionSigningKey: { findMany: jest.fn().mockResolvedValue(keyRows) },
    extensionVersion: { findUnique: jest.fn().mockResolvedValue({ id: 'version-1' }) },
    extensionValidation: { findMany: jest.fn() },
    extensionReview: { findMany: jest.fn() },
  };
  const service = new ExtensionsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);

  beforeEach(() => jest.clearAllMocks());

  it('bounds publisher pages and nested management collections', async () => {
    const page = await service.publishers(undefined, '1');

    expect(page.items).toEqual([expect.objectContaining({
      ...publisherRows[0],
      signingKeys: [],
    })]);
    expect(decodeDateIdCursor(page.nextCursor!)).toEqual({ id: 'publisher-2', createdAt: publisherRows[0].createdAt });
    expect(prisma.extensionPublisher.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 2,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: expect.objectContaining({ members: expect.objectContaining({ take: 100 }), signingKeys: expect.objectContaining({ take: 100 }) }),
    }));
  });

  it('bounds signing-key history independently', async () => {
    const page = await service.signingKeys('publisher-1', undefined, '1');

    expect(page.items).toEqual([keyRows[0]]);
    expect(prisma.extensionSigningKey.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
  });

  it('bounds validation and review histories independently', async () => {
    const validations = [
      { id: 'validation-2', startedAt: new Date('2026-02-02') },
      { id: 'validation-1', startedAt: new Date('2026-02-01') },
    ];
    const reviews = [
      { id: 'review-2', createdAt: new Date('2026-02-02') },
      { id: 'review-1', createdAt: new Date('2026-02-01') },
    ];
    prisma.extensionValidation.findMany.mockResolvedValue(validations);
    prisma.extensionReview.findMany.mockResolvedValue(reviews);

    const validationPage = await service.validationReports('version-1', undefined, '1');
    const reviewPage = await service.reviewHistory('version-1', undefined, '1');

    expect(validationPage.items).toEqual([validations[0]]);
    expect(reviewPage.items).toEqual([reviews[0]]);
    expect(prisma.extensionValidation.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
    expect(prisma.extensionReview.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
  });
});
