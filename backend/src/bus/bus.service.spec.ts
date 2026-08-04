import { BusService } from "./bus.service";

jest.mock("../tenancy/tenant-context", () => ({
  getCurrentSchoolId: () => "school-1",
}));

describe("BusService", () => {
  const prisma = {
    bus: { findMany: jest.fn(), findFirst: jest.fn() },
    busLocation: { findMany: jest.fn() },
  };
  let service: BusService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BusService(prisma as any);
  });

  it("limits parents to buses assigned to their children", async () => {
    prisma.bus.findMany.mockResolvedValue([]);

    await service.getAllBuses({ userId: "parent-1", role: "PARENT" });

    expect(prisma.bus.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentAssignments: {
            some: { status: "ACTIVE", student: { parentId: "parent-1" } },
          },
        },
      }),
    );
  });

  it("caps location history at 500 records", async () => {
    prisma.bus.findFirst.mockResolvedValue({ id: "bus-1" });
    prisma.busLocation.findMany.mockResolvedValue([]);

    await service.getLocationHistory("bus-1", 50_000);

    expect(prisma.busLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });
});
