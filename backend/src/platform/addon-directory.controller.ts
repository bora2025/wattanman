import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';
import { AddonDirectoryService } from './addon-directory.service';

@Controller('platform/addon-directory')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard)
@Roles('PLATFORM_ADMIN')
export class AddonDirectoryController {
  constructor(private directory: AddonDirectoryService) {}

  @Get()
  list() {
    return this.directory.list();
  }

  @Post()
  create(@Body() body: { name: string; kind?: string; description?: string; detailDescription?: string; screenshotUrl?: string; category?: string; icon?: string; price?: number; priceNote?: string; themeConfig?: { mode?: string; accentColor?: string; primaryColor?: string } }) {
    return this.directory.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; kind?: string; description?: string; detailDescription?: string; screenshotUrl?: string | null; category?: string; icon?: string; price?: number | null; priceNote?: string; isActive?: boolean; themeConfig?: { mode?: string; accentColor?: string; primaryColor?: string } },
  ) {
    return this.directory.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.directory.remove(id);
  }
}
