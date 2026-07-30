import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SchoolAddonsSelfServiceController } from './school-addons.controller';
import { RequiresAddonGuard } from './requires-addon.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [SchoolAddonsSelfServiceController],
  providers: [RequiresAddonGuard],
  exports: [RequiresAddonGuard],
})
export class SchoolAddonsModule {}
