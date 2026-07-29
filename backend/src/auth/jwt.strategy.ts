import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

function extractJwtFromCookieOrHeader(req: Request): string | null {
  // 1) Try HttpOnly cookie first (web)
  if (req.cookies?.access_token) {
    return req.cookies.access_token;
  }
  // 2) Fallback to Authorization header (mobile app)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: extractJwtFromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'change-me-in-production-use-a-strong-random-key',
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, email: payload.email, role: payload.role, schoolId: payload.schoolId };
  }
}