import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { getCurrentSchoolId } from "../tenancy/tenant-context";
import {
  CreateAssignmentDto,
  CreateBusDto,
  CreateRouteDto,
  CreateScheduleDto,
  CreateStopDto,
  RecordLocationDto,
  UpdateAssignmentDto,
  UpdateBusDto,
  UpdateRouteDto,
  UpdateScheduleDto,
  UpdateStopDto,
} from "./bus.dto";

type Actor = { userId: string; role: string };

const busInclude = {
  driver: { select: { id: true, name: true, phone: true } },
  assistant: { select: { id: true, name: true, phone: true } },
  route: { include: { stops: { orderBy: { order: "asc" as const } } } },
} satisfies Prisma.BusInclude;

@Injectable()
export class BusService {
  constructor(private prisma: PrismaService) {}

  private schoolId() {
    return getCurrentSchoolId();
  }

  async getAdminOptions() {
    const [students, staff] = await Promise.all([
      this.prisma.student.findMany({
        select: {
          id: true,
          studentNumber: true,
          user: { select: { name: true } },
          class: { select: { name: true } },
        },
        orderBy: { user: { name: "asc" } },
      }),
      this.prisma.user.findMany({
        where: { role: { in: ["ADMIN", "TEACHER", "EMPLOYEE", "WATTAMAN"] } },
        select: { id: true, name: true, role: true, phone: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return { students, staff };
  }

  private busVisibility(actor: Actor): Prisma.BusWhereInput {
    if (actor.role === "PARENT") {
      return {
        studentAssignments: {
          some: { status: "ACTIVE", student: { parentId: actor.userId } },
        },
      };
    }
    if (actor.role === "STUDENT") {
      return {
        studentAssignments: {
          some: { status: "ACTIVE", student: { userId: actor.userId } },
        },
      };
    }
    return {};
  }

  private routeVisibility(actor: Actor): Prisma.BusRouteWhereInput {
    if (actor.role === "PARENT") {
      return {
        studentAssignments: {
          some: { status: "ACTIVE", student: { parentId: actor.userId } },
        },
      };
    }
    if (actor.role === "STUDENT") {
      return {
        studentAssignments: {
          some: { status: "ACTIVE", student: { userId: actor.userId } },
        },
      };
    }
    return {};
  }

  private cleanOptionalIds<T extends object>(data: T): T {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        value === "" ? null : value,
      ]),
    ) as T;
  }

  private toBusData(data: CreateBusDto | UpdateBusDto) {
    const cleaned = this.cleanOptionalIds(data);
    return {
      ...cleaned,
      lastServiceAt: cleaned.lastServiceAt
        ? new Date(cleaned.lastServiceAt as string)
        : cleaned.lastServiceAt,
      nextServiceAt: cleaned.nextServiceAt
        ? new Date(cleaned.nextServiceAt as string)
        : cleaned.nextServiceAt,
    };
  }

  private async requireBus(id: string) {
    const bus = await this.prisma.bus.findFirst({ where: { id } });
    if (!bus) throw new NotFoundException("Bus not found");
    return bus;
  }

  private async requireRoute(id: string) {
    const route = await this.prisma.busRoute.findFirst({ where: { id } });
    if (!route) throw new NotFoundException("Bus route not found");
    return route;
  }

  private async validateBusRelations(data: CreateBusDto | UpdateBusDto) {
    const userIds = [data.driverId, data.assistantId].filter(
      Boolean,
    ) as string[];
    if (new Set(userIds).size !== userIds.length) {
      throw new BadRequestException(
        "Driver and assistant must be different users",
      );
    }
    if (userIds.length) {
      const count = await this.prisma.user.count({
        where: { id: { in: userIds }, schoolId: this.schoolId() },
      });
      if (count !== userIds.length)
        throw new BadRequestException(
          "Driver or assistant is not in this school",
        );
    }
    if (data.routeId) await this.requireRoute(data.routeId);
  }

  async getAllBuses(actor: Actor) {
    return this.prisma.bus.findMany({
      where: this.busVisibility(actor),
      include: busInclude,
      orderBy: { name: "asc" },
    });
  }

  async getBus(id: string, actor: Actor) {
    const bus = await this.prisma.bus.findFirst({
      where: { id, ...this.busVisibility(actor) },
      include: busInclude,
    });
    if (!bus) throw new NotFoundException("Bus not found");
    return bus;
  }

  async createBus(data: CreateBusDto) {
    await this.validateBusRelations(data);
    return this.prisma.bus.create({
      data: {
        ...this.toBusData(data),
        schoolId: this.schoolId(),
      } as Prisma.BusUncheckedCreateInput,
      include: busInclude,
    });
  }

  async updateBus(id: string, data: UpdateBusDto) {
    await this.requireBus(id);
    await this.validateBusRelations(data);
    return this.prisma.bus.update({
      where: { id },
      data: this.toBusData(data) as Prisma.BusUncheckedUpdateInput,
      include: busInclude,
    });
  }

  async deleteBus(id: string) {
    await this.requireBus(id);
    return this.prisma.bus.delete({ where: { id } });
  }

  async getAllRoutes(actor: Actor) {
    return this.prisma.busRoute.findMany({
      where: this.routeVisibility(actor),
      include: {
        stops: { orderBy: { order: "asc" } },
        schedules: { orderBy: { departureTime: "asc" } },
      },
      orderBy: { name: "asc" },
    });
  }

  async createRoute(data: CreateRouteDto) {
    return this.prisma.busRoute.create({
      data: {
        ...data,
        effectiveFrom: data.effectiveFrom
          ? new Date(data.effectiveFrom)
          : undefined,
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : undefined,
        schoolId: this.schoolId(),
      },
    });
  }

  async updateRoute(id: string, data: UpdateRouteDto) {
    await this.requireRoute(id);
    return this.prisma.busRoute.update({
      where: { id },
      data: {
        ...data,
        effectiveFrom: data.effectiveFrom
          ? new Date(data.effectiveFrom)
          : undefined,
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : undefined,
      },
    });
  }

  async deleteRoute(id: string) {
    await this.requireRoute(id);
    return this.prisma.busRoute.delete({ where: { id } });
  }

  async addStop(routeId: string, data: CreateStopDto) {
    await this.requireRoute(routeId);
    return this.prisma.busStop.create({
      data: { ...data, routeId, schoolId: this.schoolId() },
    });
  }

  async updateStop(id: string, data: UpdateStopDto) {
    const stop = await this.prisma.busStop.findFirst({ where: { id } });
    if (!stop) throw new NotFoundException("Bus stop not found");
    return this.prisma.busStop.update({ where: { id }, data });
  }

  async reorderStops(routeId: string, stopIds: string[]) {
    await this.requireRoute(routeId);
    const stops = await this.prisma.busStop.findMany({
      where: { routeId },
      select: { id: true },
    });
    if (
      stops.length !== stopIds.length ||
      stops.some((stop) => !stopIds.includes(stop.id))
    ) {
      throw new BadRequestException(
        "Stop order must contain every route stop exactly once",
      );
    }
    await this.prisma.$transaction(
      stopIds.map((id, order) =>
        this.prisma.busStop.update({ where: { id }, data: { order } }),
      ),
    );
    return this.prisma.busStop.findMany({
      where: { routeId },
      orderBy: { order: "asc" },
    });
  }

  async deleteStop(id: string) {
    const stop = await this.prisma.busStop.findFirst({ where: { id } });
    if (!stop) throw new NotFoundException("Bus stop not found");
    return this.prisma.busStop.delete({ where: { id } });
  }

  async listAssignments() {
    return this.prisma.busStudentAssignment.findMany({
      include: {
        student: {
          include: {
            user: { select: { id: true, name: true } },
            class: { select: { id: true, name: true } },
          },
        },
        bus: { select: { id: true, name: true, plateNumber: true } },
        route: { select: { id: true, name: true } },
        pickupStop: true,
        dropoffStop: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async validateAssignment(
    data: CreateAssignmentDto | UpdateAssignmentDto,
  ) {
    if (data.studentId) {
      const student = await this.prisma.student.findFirst({
        where: { id: data.studentId },
      });
      if (!student)
        throw new BadRequestException("Student is not in this school");
    }
    const route = data.routeId ? await this.requireRoute(data.routeId) : null;
    const bus = data.busId ? await this.requireBus(data.busId) : null;
    if (bus && route && bus.routeId && bus.routeId !== route.id)
      throw new BadRequestException("Bus is assigned to a different route");
    const stopIds = [data.pickupStopId, data.dropoffStopId].filter(
      Boolean,
    ) as string[];
    if (stopIds.length) {
      const stops = await this.prisma.busStop.findMany({
        where: { id: { in: stopIds } },
      });
      if (stops.length !== new Set(stopIds).size)
        throw new BadRequestException("Pickup or drop-off stop not found");
      if (route && stops.some((stop) => stop.routeId !== route.id))
        throw new BadRequestException(
          "Stops must belong to the selected route",
        );
    }
  }

  async createAssignment(data: CreateAssignmentDto) {
    await this.validateAssignment(data);
    return this.prisma.busStudentAssignment.create({
      data: this.assignmentData(
        data,
        true,
      ) as Prisma.BusStudentAssignmentUncheckedCreateInput,
    });
  }

  async updateAssignment(id: string, data: UpdateAssignmentDto) {
    const existing = await this.prisma.busStudentAssignment.findFirst({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Bus assignment not found");
    const merged = {
      ...existing,
      ...this.cleanOptionalIds(data),
    } as unknown as CreateAssignmentDto;
    await this.validateAssignment(merged);
    return this.prisma.busStudentAssignment.update({
      where: { id },
      data: this.assignmentData(
        data,
        false,
      ) as Prisma.BusStudentAssignmentUncheckedUpdateInput,
    });
  }

  private assignmentData(
    data: CreateAssignmentDto | UpdateAssignmentDto,
    create: boolean,
  ) {
    const cleaned = this.cleanOptionalIds(data);
    return {
      ...cleaned,
      ...(create ? { schoolId: this.schoolId() } : {}),
      effectiveFrom: cleaned.effectiveFrom
        ? new Date(cleaned.effectiveFrom as string)
        : undefined,
      effectiveTo: cleaned.effectiveTo
        ? new Date(cleaned.effectiveTo as string)
        : cleaned.effectiveTo,
    };
  }

  async deleteAssignment(id: string) {
    const assignment = await this.prisma.busStudentAssignment.findFirst({
      where: { id },
    });
    if (!assignment) throw new NotFoundException("Bus assignment not found");
    return this.prisma.busStudentAssignment.delete({ where: { id } });
  }

  async listSchedules() {
    return this.prisma.busSchedule.findMany({
      include: { route: true, bus: true },
      orderBy: [{ departureTime: "asc" }, { name: "asc" }],
    });
  }

  private async validateSchedule(data: CreateScheduleDto | UpdateScheduleDto) {
    const route = data.routeId ? await this.requireRoute(data.routeId) : null;
    const bus = data.busId ? await this.requireBus(data.busId) : null;
    if (bus && route && bus.routeId && bus.routeId !== route.id)
      throw new BadRequestException("Bus is assigned to a different route");
  }

  private scheduleData(
    data: CreateScheduleDto | UpdateScheduleDto,
    create: boolean,
  ) {
    const cleaned = this.cleanOptionalIds(data);
    return {
      ...cleaned,
      ...(create ? { schoolId: this.schoolId() } : {}),
      effectiveFrom: cleaned.effectiveFrom
        ? new Date(cleaned.effectiveFrom as string)
        : undefined,
      effectiveTo: cleaned.effectiveTo
        ? new Date(cleaned.effectiveTo as string)
        : cleaned.effectiveTo,
    };
  }

  async createSchedule(data: CreateScheduleDto) {
    await this.validateSchedule(data);
    return this.prisma.busSchedule.create({
      data: this.scheduleData(
        data,
        true,
      ) as Prisma.BusScheduleUncheckedCreateInput,
    });
  }

  async updateSchedule(id: string, data: UpdateScheduleDto) {
    const existing = await this.prisma.busSchedule.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("Bus schedule not found");
    await this.validateSchedule({
      ...existing,
      ...this.cleanOptionalIds(data),
    } as unknown as CreateScheduleDto);
    return this.prisma.busSchedule.update({
      where: { id },
      data: this.scheduleData(
        data,
        false,
      ) as Prisma.BusScheduleUncheckedUpdateInput,
    });
  }

  async deleteSchedule(id: string) {
    const schedule = await this.prisma.busSchedule.findFirst({ where: { id } });
    if (!schedule) throw new NotFoundException("Bus schedule not found");
    return this.prisma.busSchedule.delete({ where: { id } });
  }

  async getLatestLocation(busId: string, actor: Actor) {
    await this.getBus(busId, actor);
    return this.prisma.busLocation.findFirst({
      where: { busId },
      orderBy: { timestamp: "desc" },
    });
  }

  async recordLocation(busId: string, data: RecordLocationDto) {
    await this.requireBus(busId);
    return this.prisma.busLocation.create({
      data: { busId, ...data, schoolId: this.schoolId() },
    });
  }

  async getLocationHistory(busId: string, limit = 100) {
    await this.requireBus(busId);
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.trunc(limit), 1), 500)
      : 100;
    return this.prisma.busLocation.findMany({
      where: { busId },
      orderBy: { timestamp: "desc" },
      take: safeLimit,
    });
  }
}
