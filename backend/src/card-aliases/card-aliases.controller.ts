import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CardAliasesService } from './card-aliases.service';

@Controller('card-aliases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CardAliasesController {
  constructor(private svc: CardAliasesService) {}

  @Get()
  @Roles('ADMIN', 'WATTAMAN')
  list() {
    return this.svc.list();
  }

  @Get('students')
  @Roles('ADMIN', 'WATTAMAN')
  searchStudents(@Query('q') q?: string) {
    return this.svc.searchStudents(q);
  }

  @Post()
  @Roles('ADMIN', 'WATTAMAN')
  create(
    @Body() body: { qrValue: string; studentId: string },
    @Request() req: any,
  ) {
    return this.svc.create(body.qrValue, body.studentId, req.user?.userId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
