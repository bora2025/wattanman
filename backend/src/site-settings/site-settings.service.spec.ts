import { SiteSettingsService } from './site-settings.service';

jest.mock('../tenancy/tenant-context', () => ({ getCurrentSchoolId: () => 'school-1' }));

describe('SiteSettingsService', () => {
  const prisma = {
    siteSetting: {
      upsert: jest.fn(),
    },
  };
  const service = new SiteSettingsService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('preserves legacy custom CSS instead of accepting direct mutations', async () => {
    prisma.siteSetting.upsert.mockResolvedValue({
      schoolId: 'school-1',
      siteName: 'Updated school',
      customCss: '.legacy-theme { color: teal; }',
      heroSlides: '[]',
      aboutFeatures: '[]',
    });

    await service.update({ siteName: 'Updated school', customCss: '.unsafe { display: none; }' } as any);

    expect(prisma.siteSetting.upsert).toHaveBeenCalledWith({
      where: { schoolId: 'school-1' },
      create: { schoolId: 'school-1', siteName: 'Updated school' },
      update: { siteName: 'Updated school' },
    });
  });
});
