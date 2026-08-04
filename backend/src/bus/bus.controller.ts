import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { RequiresAddon } from "../school-addons/requires-addon.decorator";
import {
  CreateAssignmentDto,
  CreateBusDto,
  CreateRouteDto,
  CreateScheduleDto,
  CreateStopDto,
  RecordLocationDto,
  ReorderStopsDto,
  UpdateAssignmentDto,
  UpdateBusDto,
  UpdateRouteDto,
  UpdateScheduleDto,
  UpdateStopDto,
} from "./bus.dto";
import { BusService } from "./bus.service";

@Controller("bus")
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiresAddon("BUS")
export class BusController {
  constructor(private busService: BusService) {}

  @Roles("ADMIN", "TEACHER", "PARENT", "STUDENT")
  @Get()
  getAllBuses(@Req() req: any) {
    return this.busService.getAllBuses(req.user);
  }

  @Roles("ADMIN", "TEACHER", "PARENT", "STUDENT")
  @Get("routes/all")
  getAllRoutes(@Req() req: any) {
    return this.busService.getAllRoutes(req.user);
  }

  @Roles("ADMIN")
  @Get("admin/options")
  getAdminOptions() {
    return this.busService.getAdminOptions();
  }

  @Roles("ADMIN")
  @Post("routes")
  createRoute(@Body() body: CreateRouteDto) {
    return this.busService.createRoute(body);
  }

  @Roles("ADMIN")
  @Put("routes/:id")
  updateRoute(@Param("id") id: string, @Body() body: UpdateRouteDto) {
    return this.busService.updateRoute(id, body);
  }

  @Roles("ADMIN")
  @Delete("routes/:id")
  deleteRoute(@Param("id") id: string) {
    return this.busService.deleteRoute(id);
  }

  @Roles("ADMIN")
  @Post("routes/:routeId/stops")
  addStop(@Param("routeId") routeId: string, @Body() body: CreateStopDto) {
    return this.busService.addStop(routeId, body);
  }

  @Roles("ADMIN")
  @Put("routes/:routeId/stops/reorder")
  reorderStops(
    @Param("routeId") routeId: string,
    @Body() body: ReorderStopsDto,
  ) {
    return this.busService.reorderStops(routeId, body.stopIds);
  }

  @Roles("ADMIN")
  @Put("stops/:id")
  updateStop(@Param("id") id: string, @Body() body: UpdateStopDto) {
    return this.busService.updateStop(id, body);
  }

  @Roles("ADMIN")
  @Delete("stops/:id")
  deleteStop(@Param("id") id: string) {
    return this.busService.deleteStop(id);
  }

  @Roles("ADMIN")
  @Get("assignments/all")
  listAssignments() {
    return this.busService.listAssignments();
  }

  @Roles("ADMIN")
  @Post("assignments")
  createAssignment(@Body() body: CreateAssignmentDto) {
    return this.busService.createAssignment(body);
  }

  @Roles("ADMIN")
  @Put("assignments/:id")
  updateAssignment(@Param("id") id: string, @Body() body: UpdateAssignmentDto) {
    return this.busService.updateAssignment(id, body);
  }

  @Roles("ADMIN")
  @Delete("assignments/:id")
  deleteAssignment(@Param("id") id: string) {
    return this.busService.deleteAssignment(id);
  }

  @Roles("ADMIN")
  @Get("schedules/all")
  listSchedules() {
    return this.busService.listSchedules();
  }

  @Roles("ADMIN")
  @Post("schedules")
  createSchedule(@Body() body: CreateScheduleDto) {
    return this.busService.createSchedule(body);
  }

  @Roles("ADMIN")
  @Put("schedules/:id")
  updateSchedule(@Param("id") id: string, @Body() body: UpdateScheduleDto) {
    return this.busService.updateSchedule(id, body);
  }

  @Roles("ADMIN")
  @Delete("schedules/:id")
  deleteSchedule(@Param("id") id: string) {
    return this.busService.deleteSchedule(id);
  }

  @Roles("ADMIN")
  @Post()
  createBus(@Body() body: CreateBusDto) {
    return this.busService.createBus(body);
  }

  @Roles("ADMIN", "TEACHER", "PARENT", "STUDENT")
  @Get(":id/location")
  getLocation(@Param("id") id: string, @Req() req: any) {
    return this.busService.getLatestLocation(id, req.user);
  }

  @Roles("ADMIN", "WATTAMAN")
  @Post(":id/location")
  recordLocation(@Param("id") id: string, @Body() body: RecordLocationDto) {
    return this.busService.recordLocation(id, body);
  }

  @Roles("ADMIN")
  @Get(":id/history")
  getHistory(@Param("id") id: string, @Query("limit") limit?: string) {
    return this.busService.getLocationHistory(id, limit ? Number(limit) : 100);
  }

  @Roles("ADMIN", "TEACHER", "PARENT", "STUDENT")
  @Get(":id")
  getBus(@Param("id") id: string, @Req() req: any) {
    return this.busService.getBus(id, req.user);
  }

  @Roles("ADMIN")
  @Put(":id")
  updateBus(@Param("id") id: string, @Body() body: UpdateBusDto) {
    return this.busService.updateBus(id, body);
  }

  @Roles("ADMIN")
  @Delete(":id")
  deleteBus(@Param("id") id: string) {
    return this.busService.deleteBus(id);
  }
}
