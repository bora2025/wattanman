import { Module } from "@nestjs/common";
import { BusController } from "./bus.controller";
import { BusService } from "./bus.service";
import { DatabaseModule } from "../database/database.module";

@Module({
  imports: [DatabaseModule],
  controllers: [BusController],
  providers: [BusService],
})
export class BusModule {}
