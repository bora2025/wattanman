import { Module } from '@nestjs/common';
import { SchoolModulesController } from './school-modules.controller';

@Module({
  controllers: [SchoolModulesController],
})
export class SchoolModulesModule {}
