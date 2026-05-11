import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FeesService } from './fees.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('fees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeesController {
  constructor(private feesService: FeesService) {}

  // ─── Students dropdown ────────────────────────────────────────────────────

  @Roles('ADMIN')
  @Get('students')
  getStudents() {
    return this.feesService.getStudents();
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  @Roles('ADMIN')
  @Get('summary')
  getSummary() {
    return this.feesService.getSummary();
  }

  // ─── Fee Records ──────────────────────────────────────────────────────────

  @Roles('ADMIN')
  @Get()
  getAll(
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.feesService.getAll(status, search);
  }

  @Roles('ADMIN')
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.feesService.getOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(
    @Body() body: {
      studentId: string;
      totalAmount: number;
      dueDate: string;
      term?: string;
      notes?: string;
    },
    @Request() req: any,
  ) {
    return this.feesService.create({ ...body, createdById: req.user.userId });
  }

  @Roles('ADMIN')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: { totalAmount?: number; dueDate?: string; term?: string; notes?: string },
  ) {
    return this.feesService.update(id, body);
  }

  @Roles('ADMIN')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.feesService.delete(id);
  }

  // ─── Record a payment on a fee record ─────────────────────────────────────

  @Roles('ADMIN')
  @Post(':id/payments')
  recordPayment(
    @Param('id') id: string,
    @Body() body: { amount: number; note?: string },
    @Request() req: any,
  ) {
    return this.feesService.recordPayment(id, { ...body, createdById: req.user.userId });
  }
}
