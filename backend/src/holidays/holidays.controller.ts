import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequiresAddon } from '../school-addons/requires-addon.decorator';

// Holidays only ever feed attendance calculations (day-off detection, rate
// calculations in reports.service.ts) — confirmed via a full consumer audit,
// no other module reads this.
@Controller('holidays')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiresAddon('ATTENDANCE')
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @Get()
  async getHolidays(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    if (month) {
      return this.holidaysService.getHolidaysByMonth(y, parseInt(month, 10));
    }
    return this.holidaysService.getHolidaysByYear(y);
  }

  @Get('check')
  async checkHoliday(@Query('date') date: string) {
    const d = new Date(date);
    const isHoliday = await this.holidaysService.isHoliday(d);
    return { isHoliday };
  }

  @Roles('ADMIN')
  @Post()
  async createHoliday(
    @Body() body: { date: string; name: string; description?: string; type?: string; createdById: string },
  ) {
    return this.holidaysService.createHoliday(body);
  }

  @Roles('ADMIN')
  @Put(':id')
  async updateHoliday(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; type?: string; date?: string },
  ) {
    return this.holidaysService.updateHoliday(id, body);
  }

  @Roles('ADMIN')
  @Delete(':id')
  async deleteHoliday(@Param('id') id: string) {
    return this.holidaysService.deleteHoliday(id);
  }
}
