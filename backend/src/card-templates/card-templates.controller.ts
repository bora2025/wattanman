import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { CardTemplatesService } from './card-templates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('card-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class CardTemplatesController {
  constructor(private readonly cardTemplatesService: CardTemplatesService) {}

  @Get()
  findAll() {
    return this.cardTemplatesService.findAll();
  }

  @Post()
  create(@Body() body: { name: string; cardType: string; design: object }) {
    return this.cardTemplatesService.create(body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.cardTemplatesService.delete(id);
  }
}
