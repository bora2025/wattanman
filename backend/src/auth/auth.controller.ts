import { Controller, Post, Body, UseGuards, Get, Query, Put, Delete, Param, HttpException, HttpStatus, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const isProduction = process.env.NODE_ENV === 'production';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction || process.env.COOKIE_SECURE === 'true',
  sameSite: 'none' as const,
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /** Helper: set both access + refresh cookies */
  private setTokenCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth/refresh', // only sent to the refresh endpoint (via Next.js proxy)
    });
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('login')
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateUser(body.email, body.password);
    if (!user) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }
    const { access_token, refresh_token } = await this.authService.login(user);
    this.setTokenCookies(res, access_token, refresh_token);
    // Return tokens in body as well (mobile app needs them)
    return { access_token, refresh_token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  }

  @SkipThrottle()
  @Post('refresh')
  async refresh(@Request() req, @Res({ passthrough: true }) res: Response) {
    const oldToken = req.cookies?.refresh_token;
    if (!oldToken) {
      throw new HttpException('No refresh token', HttpStatus.UNAUTHORIZED);
    }
    const { accessToken, refreshToken } = await this.authService.rotateRefreshToken(oldToken);
    this.setTokenCookies(res, accessToken, refreshToken);
    return { access_token: accessToken };
  }

  @Post('logout')
  async logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    // Try to revoke refresh tokens if user is authenticated, but don't require it
    try {
      const token = req.cookies?.access_token;
      if (token) {
        const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'change-me-in-production-use-a-strong-random-key');
        if (payload?.sub) {
          await this.authService.revokeAllRefreshTokens(payload.sub);
        }
      }
    } catch { /* token expired or invalid – still allow logout */ }
    res.clearCookie('access_token', { ...COOKIE_OPTIONS });
    res.clearCookie('refresh_token', { ...COOKIE_OPTIONS, path: '/api/auth/refresh' });
    return { message: 'Logged out' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('register')
  async register(@Body() body: RegisterDto & { departmentId?: string }) {
    try {
      return await this.authService.register(body.email, body.password, body.name, body.role, body.departmentId);
    } catch (error: any) {
      if (error.message === 'Email already exists') {
        throw new HttpException('Email already exists', HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile')
  getProfile(@Request() req) {
    return req.user;
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getCurrentUser(@Request() req) {
    return this.authService.getUserById(req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('users')
  async getUsers(@Query('role') role?: string, @Query('roles') roles?: string) {
    if (roles) {
      const rolesArr = roles.split(',').map(r => r.trim().toUpperCase());
      return this.authService.getUsers(undefined, rolesArr);
    }
    return this.authService.getUsers(role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('users/bulk')
  async bulkRegister(@Body() body: { users: { email: string; password: string; name: string; role: string; photo?: string }[] }) {
    return this.authService.bulkRegister(body.users);
  }

  @UseGuards(JwtAuthGuard)
  @Put('users/:id/photo')
  async updateUserPhoto(@Param('id') id: string, @Body() body: { photo: string }) {
    return this.authService.updateUserPhoto(id, body.photo);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Put('users/:id/password')
  async resetUserPassword(@Param('id') id: string, @Body() body: { password: string }) {
    if (!body?.password || body.password.length < 6) {
      throw new HttpException('Password must be at least 6 characters', HttpStatus.BAD_REQUEST);
    }
    await this.authService.resetUserPassword(id, body.password);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Put('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: { name?: string; email?: string; role?: string; phone?: string; departmentId?: string | null },
  ) {
    try {
      return await this.authService.updateUser(id, body);
    } catch (error: any) {
      if (error.message === 'Email already exists') {
        throw new HttpException('Email already exists', HttpStatus.BAD_REQUEST);
      }
      if (error.message === 'Invalid role') {
        throw new HttpException('Invalid role', HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Put('users/:id/parent')
  async setStudentParent(
    @Param('id') studentUserId: string,
    @Body() body: { parentId: string | null },
  ) {
    try {
      return await this.authService.setStudentParent(studentUserId, body?.parentId ?? null);
    } catch (e: any) {
      throw new HttpException(e?.message ?? 'Failed to set parent', HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('users/search')
  async searchUsers(@Query('q') query: string, @Query('role') role?: string) {
    return this.authService.searchUsers(query || '', role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Request() req: any) {
    if (req.user?.userId === id) {
      throw new HttpException('Cannot delete your own account', HttpStatus.FORBIDDEN);
    }
    try {
      return await this.authService.deleteUser(id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to delete user', HttpStatus.BAD_REQUEST);
    }
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('users/:id/schedule')
  getStudentSchedule(@Param('id') id: string) {
    return this.authService.getStudentSchedule(id);
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('users/:id/full-profile')
  getFullProfile(@Param('id') id: string) {
    return this.authService.getFullProfile(id);
  }
}