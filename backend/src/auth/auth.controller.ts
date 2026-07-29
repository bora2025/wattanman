import { Controller, Post, Body, UseGuards, Get, Query, Put, Delete, Param, HttpException, HttpStatus, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuditService } from '../audit/audit.service';
import { tenantContext } from '../tenancy/tenant-context';

const isProduction = process.env.NODE_ENV === 'production';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction || process.env.COOKIE_SECURE === 'true',
  sameSite: 'none' as const,
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private audit: AuditService,
  ) {}

  /** Extract client IP honouring X-Forwarded-For */
  private clientIp(req: any): string | null {
    const xff = req.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
    return req.ip ?? req.socket?.remoteAddress ?? null;
  }

  /**
   * Only a SUPER_ADMIN can modify or delete another SUPER_ADMIN.
   * Throws 403 otherwise.
   */
  private async assertCanManageTarget(actorRole: string | undefined, targetUserId: string) {
    const target = await this.authService.findById(targetUserId);
    if (!target) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    if (target.role === 'SUPER_ADMIN' && actorRole !== 'SUPER_ADMIN') {
      throw new HttpException('Only a Super Admin can modify another Super Admin', HttpStatus.FORBIDDEN);
    }
    return target;
  }

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
  async login(@Body() body: LoginDto, @Request() req: any, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateUser(body.email, body.password);
    if (!user) {
      this.audit.log({
        action: 'LOGIN_FAILED',
        resource: 'AUTH',
        actorEmail: body?.email ?? null,
        method: 'POST',
        path: '/auth/login',
        ip: this.clientIp(req),
        userAgent: req.headers?.['user-agent'] ?? null,
        success: false,
        errorMessage: 'Invalid credentials',
      });
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    // MFA enforcement — currently PLATFORM_ADMIN only (Phase 2a). A PLATFORM_ADMIN
    // account can reach every school, so it's the one role this system requires
    // stronger-than-password auth for. Accounts that haven't enrolled yet
    // (mfaEnabled === false) are still allowed to log in — enrollment happens
    // authenticated, post-login (see /auth/mfa/setup), so blocking login entirely
    // would make first-time setup impossible. `mfaSetupRequired` in the response
    // lets the frontend force that flow before anything else.
    if (user.role === 'PLATFORM_ADMIN' && user.mfaEnabled) {
      if (!this.authService.verifyMfaCode(user.mfaSecret, body.mfaCode || '')) {
        this.audit.log({
          action: 'LOGIN_FAILED',
          resource: 'AUTH',
          actorId: user.id,
          actorRole: user.role,
          actorEmail: user.email,
          method: 'POST',
          path: '/auth/login',
          ip: this.clientIp(req),
          userAgent: req.headers?.['user-agent'] ?? null,
          success: false,
          errorMessage: 'Invalid or missing MFA code',
        });
        throw new HttpException(
          body.mfaCode ? 'Invalid MFA code' : { error: 'MFA_REQUIRED', message: 'MFA code required' },
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

    const { access_token, refresh_token } = await this.authService.login(user);
    this.setTokenCookies(res, access_token, refresh_token);
    this.audit.log({
      action: 'LOGIN',
      resource: 'AUTH',
      actorId: user.id,
      actorRole: user.role,
      actorName: user.name,
      actorEmail: user.email,
      method: 'POST',
      path: '/auth/login',
      ip: this.clientIp(req),
      userAgent: req.headers?.['user-agent'] ?? null,
      success: true,
    });
    // Return tokens in body as well (mobile app needs them)
    return {
      access_token,
      refresh_token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      mfaSetupRequired: user.role === 'PLATFORM_ADMIN' && !user.mfaEnabled,
    };
  }

  /** Establishes a same-origin session cookie from an impersonation token
   * issued on the platform host (see PlatformModule's SchoolsService.impersonate).
   * The browser can't just be handed that token as a cookie there — cookies
   * are host-only by design (Phase 2a's standing guardrail against cross-tenant
   * session leakage) and platform.wattaman.app can't set a cookie for
   * someschool.wattaman.app. Instead the token rides in the URL to the target
   * subdomain (frontend/app/session-bridge/page.tsx), and this endpoint —
   * called from that page, so it lands on the correct origin — verifies it and
   * sets the cookie for whichever host actually received the request.
   * Deliberately narrower than /auth/login: no MFA path, no refresh token
   * issued (impersonation sessions are bounded and re-request their own fresh
   * token+reason if extended), and only tokens carrying `impersonatedBy` are
   * accepted (enforced in AuthService.verifyImpersonationToken). */
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('session/consume')
  async consumeSession(@Body() body: { token: string }, @Request() req: any, @Res({ passthrough: true }) res: Response) {
    const payload = this.authService.verifyImpersonationToken(body?.token || '');
    const store = tenantContext.getStore();
    if (!store || store.schoolId !== payload.schoolId) {
      throw new HttpException('Session does not match the current school', HttpStatus.UNAUTHORIZED);
    }
    const maxAgeMs = Math.max(0, payload.exp * 1000 - Date.now());
    res.cookie('access_token', body.token, { ...COOKIE_OPTIONS, maxAge: maxAgeMs });
    this.audit.log({
      action: 'IMPERSONATION_SESSION_CONSUMED',
      resource: 'AUTH',
      actorId: payload.sub,
      actorRole: payload.role,
      actorEmail: payload.email,
      method: 'POST',
      path: '/auth/session/consume',
      ip: this.clientIp(req),
      userAgent: req.headers?.['user-agent'] ?? null,
      success: true,
      metadata: { impersonatedBy: payload.impersonatedBy },
    });
    return { ok: true, role: payload.role };
  }

  /** Step 1 of MFA enrollment — generates a TOTP secret (not yet enabled) and
   * an otpauth:// URL for the frontend to render as a QR code (the existing
   * `qrcode` package is already a frontend dependency, no new one needed). */
  @UseGuards(JwtAuthGuard)
  @Post('mfa/setup')
  async mfaSetup(@Request() req: any) {
    return this.authService.setupMfa(req.user.userId);
  }

  /** Step 2 — verify the first code, which is what actually flips mfaEnabled. */
  @UseGuards(JwtAuthGuard)
  @Post('mfa/verify')
  async mfaVerify(@Request() req: any, @Body() body: { code: string }) {
    return this.authService.verifyAndEnableMfa(req.user.userId, body?.code || '');
  }

  // Same 5/min throttle as login — this endpoint triggers an email/SMS send per
  // request and accepts arbitrary identifiers, so it needs its own rate limit
  // independent of whether the identifier resolves to a real account.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('forgot-password')
  async forgotPassword(@Body() body: { identifier: string }) {
    await this.authService.requestPasswordReset(body?.identifier || '');
    // Same response whether or not an account matched — see AuthService.requestPasswordReset.
    return { message: 'If an account exists for that email or phone, a reset link has been sent.' };
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; password: string }) {
    if (!body?.password || body.password.length < 6) {
      throw new HttpException('Password must be at least 6 characters', HttpStatus.BAD_REQUEST);
    }
    await this.authService.resetPassword(body.token, body.password);
    return { ok: true };
  }

  @SkipThrottle()
  @Post('refresh')
  async refresh(@Request() req, @Body() body: { refresh_token?: string } = {}, @Res({ passthrough: true }) res: Response) {
    // Cookie for web; body for mobile (no cookies available).
    const oldToken = req.cookies?.refresh_token || body?.refresh_token;
    if (!oldToken) {
      throw new HttpException('No refresh token', HttpStatus.UNAUTHORIZED);
    }
    const { accessToken, refreshToken } = await this.authService.rotateRefreshToken(oldToken);
    this.setTokenCookies(res, accessToken, refreshToken);
    // Return both tokens in body so mobile clients can persist them.
    return { access_token: accessToken, refresh_token: refreshToken };
  }

  @Post('logout')
  async logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    // Try to revoke refresh tokens if user is authenticated, but don't require it
    let logoutActorId: string | null = null;
    try {
      const token = req.cookies?.access_token;
      if (token) {
        const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'change-me-in-production-use-a-strong-random-key');
        if (payload?.sub) {
          logoutActorId = payload.sub;
          await this.authService.revokeAllRefreshTokens(payload.sub);
        }
      }
    } catch { /* token expired or invalid – still allow logout */ }
    res.clearCookie('access_token', { ...COOKIE_OPTIONS });
    res.clearCookie('refresh_token', { ...COOKIE_OPTIONS, path: '/api/auth/refresh' });
    this.audit.log({
      action: 'LOGOUT',
      resource: 'AUTH',
      actorId: logoutActorId,
      method: 'POST',
      path: '/auth/logout',
      ip: this.clientIp(req),
      userAgent: req.headers?.['user-agent'] ?? null,
      success: true,
    });
    return { message: 'Logged out' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('register')
  async register(@Body() body: RegisterDto & { departmentId?: string }) {
    try {
      return await this.authService.register(body.email, body.password, body.name, body.role, body.departmentId, body.phone);
    } catch (error: any) {
      if (error.message === 'Email already exists' || error.message === 'Phone number already registered' || error.message === 'Email or phone is required' || error.message === 'Invalid email address') {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
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
  async resetUserPassword(@Param('id') id: string, @Body() body: { password: string }, @Request() req: any) {
    if (!body?.password || body.password.length < 6) {
      throw new HttpException('Password must be at least 6 characters', HttpStatus.BAD_REQUEST);
    }
    await this.assertCanManageTarget(req.user?.role, id);
    await this.authService.resetUserPassword(id, body.password);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Put('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: { name?: string; email?: string; role?: string; phone?: string; departmentId?: string | null },
    @Request() req: any,
  ) {
    await this.assertCanManageTarget(req.user?.role, id);
    // Also: only SUPER_ADMIN may promote a user TO SUPER_ADMIN.
    if (body?.role === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
      throw new HttpException('Only a Super Admin can assign the Super Admin role', HttpStatus.FORBIDDEN);
    }
    try {
      return await this.authService.updateUser(id, body);
    } catch (error: any) {
      if (error.message === 'Email already exists' || error.message === 'Phone number already registered') {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
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
    await this.assertCanManageTarget(req.user?.role, id);
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
  @UseGuards(JwtAuthGuard)
  @Get('my-schedule')
  getMySchedule(@Request() req: any) {
    return this.authService.getStudentSchedule(req.user.userId);
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @Get('my-teacher-schedule')
  getMyTeacherSchedule(@Request() req: any) {
    return this.authService.getTeacherSchedule(req.user.userId);
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARENT', 'ADMIN', 'SUPER_ADMIN')
  @Get('child-schedule/:childUserId')
  getChildSchedule(@Param('childUserId') childUserId: string) {
    return this.authService.getStudentSchedule(childUserId);
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('users/:id/full-profile')
  getFullProfile(@Param('id') id: string) {
    return this.authService.getFullProfile(id);
  }
}