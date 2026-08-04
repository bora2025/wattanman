import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export enum BusStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  MAINTENANCE = "MAINTENANCE",
}

export enum RouteStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

export enum BusDirection {
  INBOUND = "INBOUND",
  OUTBOUND = "OUTBOUND",
  BOTH = "BOTH",
}

export enum AssignmentStatus {
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  ENDED = "ENDED",
}

export enum HandoffPolicy {
  GUARDIAN = "GUARDIAN",
  SELF_RELEASE = "SELF_RELEASE",
  SCHOOL_STAFF = "SCHOOL_STAFF",
}

export enum Weekday {
  MON = "MON",
  TUE = "TUE",
  WED = "WED",
  THU = "THU",
  FRI = "FRI",
  SAT = "SAT",
  SUN = "SUN",
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateBusDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsString() @MinLength(2) @MaxLength(30) plateNumber!: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  capacity?: number;
  @IsOptional() @IsEnum(BusStatus) status?: BusStatus;
  @IsOptional() @IsString() @MaxLength(300) statusReason?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() assistantId?: string;
  @IsOptional() @IsString() routeId?: string;
  @IsOptional() @IsString() @MaxLength(80) make?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  year?: number;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsBoolean() accessible?: boolean;
  @IsOptional() @IsString() @MaxLength(100) gpsDeviceId?: string;
  @IsOptional() @IsDateString() lastServiceAt?: string;
  @IsOptional() @IsDateString() nextServiceAt?: string;
}

export class UpdateBusDto extends CreateBusDto {
  @IsOptional() declare name: string;
  @IsOptional() declare plateNumber: string;
}

export class CreateRouteDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsEnum(RouteStatus) status?: RouteStatus;
  @IsOptional() @IsEnum(BusDirection) direction?: BusDirection;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class UpdateRouteDto extends CreateRouteDto {
  @IsOptional() declare name: string;
}

export class CreateStopDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @Type(() => Number) @IsLatitude() latitude!: number;
  @Type(() => Number) @IsLongitude() longitude!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) order?: number;
  @IsOptional() @Matches(timePattern) pickupTime?: string;
  @IsOptional() @Matches(timePattern) dropoffTime?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(3600)
  dwellSeconds?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(25)
  @Max(2000)
  geofenceRadiusMeters?: number;
  @IsOptional() @IsString() @MaxLength(500) instructions?: string;
}

export class UpdateStopDto extends CreateStopDto {
  @IsOptional() declare name: string;
  @IsOptional() declare latitude: number;
  @IsOptional() declare longitude: number;
}

export class ReorderStopsDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) stopIds!: string[];
}

export class CreateAssignmentDto {
  @IsString() studentId!: string;
  @IsOptional() @IsString() busId?: string;
  @IsString() routeId!: string;
  @IsOptional() @IsString() pickupStopId?: string;
  @IsOptional() @IsString() dropoffStopId?: string;
  @IsOptional() @IsEnum(BusDirection) direction?: BusDirection;
  @IsOptional() @IsEnum(AssignmentStatus) status?: AssignmentStatus;
  @IsOptional() @IsEnum(HandoffPolicy) handoffPolicy?: HandoffPolicy;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateAssignmentDto extends CreateAssignmentDto {
  @IsOptional() declare studentId: string;
  @IsOptional() declare routeId: string;
}

export class CreateScheduleDto {
  @IsString() routeId!: string;
  @IsOptional() @IsString() busId?: string;
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsEnum(BusDirection) direction!: BusDirection;
  @Matches(timePattern) departureTime!: string;
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Weekday, { each: true })
  weekdays!: Weekday[];
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsEnum(AssignmentStatus) status?: AssignmentStatus;
}

export class UpdateScheduleDto extends CreateScheduleDto {
  @IsOptional() declare routeId: string;
  @IsOptional() declare name: string;
  @IsOptional() declare direction: BusDirection;
  @IsOptional() declare departureTime: string;
  @IsOptional() declare weekdays: Weekday[];
  @IsOptional() declare effectiveFrom: string;
}

export class RecordLocationDto {
  @Type(() => Number) @IsLatitude() latitude!: number;
  @Type(() => Number) @IsLongitude() longitude!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) speed?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;
}
