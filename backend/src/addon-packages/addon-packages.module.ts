import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AddonPackagesController } from './addon-packages.controller';
import { AddonPackagesService } from './addon-packages.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AddonPackagesController],
  providers: [AddonPackagesService],
})
export class AddonPackagesModule {}
