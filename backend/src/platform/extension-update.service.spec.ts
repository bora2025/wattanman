import { ExtensionUpdateService } from './extension-update.service';

describe('ExtensionUpdateService', () => {
  const prisma = {
    extensionInstallation: { findMany: jest.fn(), update: jest.fn() },
    extensionLifecycleJob: { count: jest.fn() },
    extensionVersion: { updateMany: jest.fn() },
  };
  const lifecycleJobs = { submitInstallation: jest.fn() };
  const schedules = { acquire: jest.fn().mockResolvedValue(true) };
  const service = new ExtensionUpdateService(prisma as any, lifecycleJobs as any, schedules as any);
  const candidate = {
    id: 'installation-1', schoolId: 'school-a', installedVersionId: 'version-1', updatePolicy: 'NOTIFY_ADMINS', rolloutGroup: 'GENERAL', availableVersionId: null, updateNotifiedAt: null,
    installedVersion: { manifest: { permissions: ['rewards:read'] } },
    extension: { name: 'Rewards', versions: [{ id: 'version-2', extensionId: 'extension-1', version: '2.0.0', rolloutStage: 'FULL', rolloutPausedAt: null, manifest: { permissions: ['rewards:read'] } }] },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    schedules.acquire.mockResolvedValue(true);
    prisma.extensionInstallation.update.mockResolvedValue({});
    lifecycleJobs.submitInstallation.mockResolvedValue({});
    prisma.extensionLifecycleJob.count.mockResolvedValue(0);
    prisma.extensionVersion.updateMany.mockResolvedValue({ count: 1 });
  });

  it('notifies school admins once when a new version becomes available', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([candidate]);

    const result = await service.run();

    expect(result).toEqual({ upgraded: 0, notified: 1 });
    expect(prisma.extensionInstallation.update).toHaveBeenCalledWith({
      where: { id: 'installation-1' },
      data: expect.objectContaining({ availableVersionId: 'version-2', updateNotifiedAt: expect.any(Date) }),
    });
  });

  it('automatically upgrades only when no permissions are added', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([{ ...candidate, updatePolicy: 'AUTOMATIC' }]);

    const result = await service.run();

    expect(result.upgraded).toBe(1);
    expect(lifecycleJobs.submitInstallation).toHaveBeenCalledWith(
      'installation-1',
      'UPGRADE',
      { versionId: 'version-2', acknowledgePermissions: false },
      expect.objectContaining({ role: 'SYSTEM' }),
      'automatic-upgrade:installation-1:version-2',
    );
    expect(prisma.extensionInstallation.update).not.toHaveBeenCalled();
  });

  it('requires notification and manual approval when an automatic update adds permissions', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([{
      ...candidate,
      updatePolicy: 'AUTOMATIC',
      extension: { ...candidate.extension, versions: [{ ...candidate.extension.versions[0], manifest: { permissions: ['rewards:read', 'rewards:write'] } }] },
    }]);

    const result = await service.run();

    expect(result).toEqual({ upgraded: 0, notified: 1 });
    expect(lifecycleJobs.submitInstallation).not.toHaveBeenCalled();
    expect(prisma.extensionInstallation.update).toHaveBeenCalledWith({
      where: { id: 'installation-1' },
      data: expect.objectContaining({ availableVersionId: 'version-2', updateNotifiedAt: expect.any(Date) }),
    });
  });

  it('holds general schools during internal and pilot waves', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([{ ...candidate, extension: { ...candidate.extension, versions: [{ ...candidate.extension.versions[0], rolloutStage: 'PILOT' }] } }]);

    const result = await service.run();

    expect(result).toEqual({ upgraded: 0, notified: 0 });
    expect(prisma.extensionInstallation.update).not.toHaveBeenCalled();
  });

  it('uses a stable school/version bucket for percentage waves', () => {
    const target = { id: 'version-2', rolloutStage: 'PERCENT_5' };
    const eligible = Array.from({ length: 100 }, (_, index) => ({ schoolId: `school-${index}`, rolloutGroup: 'GENERAL' }))
      .filter((installation) => (service as any).inRollout(installation, target));

    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible.length).toBeLessThan(15);
    expect(eligible.map((installation) => installation.schoolId)).toEqual(
      Array.from({ length: 100 }, (_, index) => ({ schoolId: `school-${index}`, rolloutGroup: 'GENERAL' }))
        .filter((installation) => (service as any).inRollout(installation, target))
        .map((installation) => installation.schoolId),
    );
  });

  it('pauses a rollout after the configured upgrade failure threshold', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([{ ...candidate, updatePolicy: 'AUTOMATIC' }]);
    prisma.extensionLifecycleJob.count.mockResolvedValue(5);

    const result = await service.run();

    expect(result).toEqual({ upgraded: 0, notified: 0 });
    expect(prisma.extensionVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'version-2', rolloutPausedAt: null },
      data: expect.objectContaining({ rolloutPausedAt: expect.any(Date), rolloutPauseReason: expect.stringContaining('5 upgrade failures') }),
    }));
  });
});
