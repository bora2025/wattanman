import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
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

  /** Get the active (shared) design for a card type — accessible to all authenticated users */
  @Get('active/:cardType')
  @Roles()
  getActiveDesign(@Param('cardType') cardType: string) {
    return this.cardTemplatesService.getActiveDesign(cardType);
  }

  /** Set the active (shared) design for a card type — ADMIN only */
  @Put('active/:cardType')
  setActiveDesign(
    @Param('cardType') cardType: string,
    @Body() body: { design: object },
  ) {
    return this.cardTemplatesService.setActiveDesign(cardType, body.design);
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
