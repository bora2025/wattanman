import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ThemePackagesController } from './theme-packages.controller';
import { ThemePackagesService } from './theme-packages.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ThemePackagesController],
  providers: [ThemePackagesService],
})
export class ThemePackagesModule {}
