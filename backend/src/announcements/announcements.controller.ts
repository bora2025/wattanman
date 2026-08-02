import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequiresAddon } from '../school-addons/requires-addon.decorator';
import {
  AnnouncementsService,
  CreateAnnouncementDto,
} from './announcements.service';

/**
 * Phase 12: only the two ADMIN-exclusive moderation actions below
 * (listAll/remove — both unique to the Communication Hub page) are gated
 * under CHAT. Everything else here (feed/unread-count/read, and create,
 * which TEACHER also uses for their own announcements page) is shared
 * across every role's own messaging/announcements experience and stays
 * ungated on purpose — see the Phase 12 plan notes on why Chat couldn't
 * cleanly gate the Messages half at all.
 */
@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private svc: AnnouncementsService) {}

  // Admin sees all (for moderation / audit)
  @RequiresAddon('CHAT')
  @Roles('ADMIN')
  @Get('all')
  listAll() {
    return this.svc.listAll();
  }

  // Personal feed for any authenticated user
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @Get('feed')
  feed(
    @Request() req: any,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const takeNum = take ? parseInt(take, 10) : 100;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    return this.svc.listForUser(req.user.userId, isNaN(takeNum) ? 100 : takeNum, isNaN(skipNum) ? 0 : skipNum);
  }

  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @Get('unread-count')
  unread(@Request() req: any) {
    return this.svc.unreadCount(req.user.userId);
  }

  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @Patch(':id/read')
  markRead(@Param('id') id: string, @Request() req: any) {
    return this.svc.markRead(id, req.user.userId);
  }

  // Admin and Teacher can broadcast; teacher restricted to CLASS audience in service guard below
  @Roles('ADMIN', 'TEACHER')
  @Post()
  create(@Body() body: CreateAnnouncementDto, @Request() req: any) {
    // Teachers can only post CLASS announcements
    if (req.user.role === 'TEACHER' && body.audience !== 'CLASS') {
      body.audience = 'CLASS';
    }
    return this.svc.create(req.user.userId, body);
  }

  @RequiresAddon('CHAT')
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
