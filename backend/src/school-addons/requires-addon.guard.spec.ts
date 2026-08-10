import { ForbiddenException } from "@nestjs/common";
import { RequiresAddonGuard } from "./requires-addon.guard";

describe("RequiresAddonGuard extension gating", () => {
  const reflector = { get: jest.fn(), getAllAndOverride: jest.fn() };
  const prisma = { extensionInstallation: { findFirst: jest.fn() } };
  const context = {
    getHandler: jest.fn(() => function handler() {}),
    getClass: jest.fn(() => class Controller {}),
  } as any;
  let guard: RequiresAddonGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.get.mockReturnValue(false);
    reflector.getAllAndOverride.mockReturnValue("ATTENDANCE");
    guard = new RequiresAddonGuard(reflector as any, prisma as any);
  });

  it("allows an enabled installed core extension", async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue({
      id: "installation-1",
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.extensionInstallation.findFirst).toHaveBeenCalledWith({
      where: {
        enabled: true,
        installedAt: { not: null },
        uninstalledAt: null,
        extension: { key: "ATTENDANCE", status: "ACTIVE" },
        installedVersion: {
          lifecycleStatus: { in: ["PUBLISHED", "DEPRECATED"] },
        },
      },
    });
  });

  it("denies access when the extension is unavailable", async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
