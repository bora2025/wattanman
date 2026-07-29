import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SchoolAddonsReadController } from './school-addons.controller';
import { RequiresAddonGuard } from './requires-addon.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [SchoolAddonsReadController],
  providers: [RequiresAddonGuard],
  exports: [RequiresAddonGuard],
})
export class SchoolAddonsModule {}
