import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService, private prisma: PrismaService) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  /** Issue a short-lived access token (15 min) */
  signAccessToken(user: any): string {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return this.jwtService.sign(payload, {
      expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
    });
  }

  /** Create a secure random refresh token, store in DB, return the raw token */
  async createRefreshToken(userId: string): Promise<string> {
    const raw = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date();
    const days = parseInt(process.env.JWT_REFRESH_EXPIRY || '7', 10) || 7;
    expiresAt.setDate(expiresAt.getDate() + days);

    await this.prisma.refreshToken.create({
      data: { token: raw, userId, expiresAt },
    });
    return raw;
  }

  /** Validate a refresh token — returns the user or throws */
  async validateRefreshToken(token: string) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!record || record.expiresAt < new Date()) {
      if (record) {
        await this.prisma.refreshToken.delete({ where: { id: record.id } });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return record.user;
  }

  /** Rotate: delete old refresh token, issue new pair */
  async rotateRefreshToken(oldToken: string) {
    const user = await this.validateRefreshToken(oldToken);
    // Delete the old token (rotation)
    await this.prisma.refreshToken.deleteMany({ where: { token: oldToken } });
    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.createRefreshToken(user.id);
    return { accessToken, refreshToken, user };
  }

  /** Revoke all refresh tokens for a user (logout everywhere) */
  async revokeAllRefreshTokens(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  async login(user: any) {
    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.createRefreshToken(user.id);
    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async register(email: string, password: string, name: string, role: string, departmentId?: string) {
    const normalizedRole = role.trim();
    if (!normalizedRole || normalizedRole.startsWith('__')) {
      throw new Error('Invalid role');
    }
    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      const user = await this.prisma.user.create({
        data: { email, password: hashedPassword, name, role: normalizedRole as any, ...(departmentId ? { departmentId } : {}) },
      });
      const loginResult = await this.login(user);
      return {
        ...loginResult,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new Error('Email already exists');
      }
      throw error;
    }
  }

  async getUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, phone: true, role: true, photo: true, departmentId: true, department: { select: { id: true, name: true, nameKh: true } } },
    });
  }

  async getUsers(role?: string, roles?: string[]) {
    let where: any = {};
    if (roles && roles.length > 0) {
      where.role = { in: roles };
    } else if (role) {
      where.role = role.toUpperCase();
    }
    return this.prisma.user.findMany({
      where,
      select: { id: true, email: true, name: true, phone: true, role: true, photo: true, departmentId: true, createdAt: true, department: { select: { id: true, name: true, nameKh: true } } },
    });
  }

  async bulkRegister(users: { email: string; password: string; name: string; role: string; photo?: string }[]) {
    const hashedUsers = await Promise.all(
      users.map(async (u) => ({
        email: u.email,
        name: u.name,
        role: u.role,
        password: await bcrypt.hash(u.password, 12),
        ...(u.photo ? { photo: u.photo } : {}),
      }))
    );
    return this.prisma.user.createMany({ data: hashedUsers });
  }

  async updateUserPhoto(userId: string, photo: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { photo },
      select: { id: true, email: true, name: true, role: true, photo: true },
    });
  }

  async deleteUser(userId: string) {
    // Clean up related records before deleting the user
    const student = await this.prisma.student.findUnique({ where: { userId } });
    if (student) {
      await this.prisma.attendance.deleteMany({ where: { studentId: student.id } });
      await this.prisma.student.delete({ where: { id: student.id } });
    }
    await this.prisma.staffAttendance.deleteMany({ where: { userId } });
    await this.prisma.notification.deleteMany({ where: { userId } });
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return this.prisma.user.delete({ where: { id: userId } });
  }

  async updateUser(userId: string, data: { name?: string; email?: string; role?: string; phone?: string; departmentId?: string | null }) {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.departmentId !== undefined) updateData.departmentId = data.departmentId || null;
    if (data.role) {
      const trimmed = data.role.trim();
      if (!trimmed || trimmed.startsWith('__')) {
        throw new Error('Invalid role');
      }
      updateData.role = trimmed;
    }
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: { id: true, email: true, name: true, phone: true, role: true, photo: true, departmentId: true, createdAt: true, department: { select: { id: true, name: true, nameKh: true } } },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new Error('Email already exists');
      }
      throw error;
    }
  }

  async searchUsers(query: string, role?: string) {
    const where: any = {};
    if (role) {
      where.role = role.toUpperCase();
    }
    if (query) {
      where.OR = [
        { name: { contains: query } },
        { email: { contains: query } },
        { phone: { contains: query } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        photo: true,
        role: true,
        createdAt: true,
        department: { select: { id: true, name: true } },
        studentProfile: {
          select: {
            id: true,
            studentNumber: true,
            sex: true,
            photo: true,
            dateOfBirth: true,
            address: true,
            class: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 50,
    });

    return users;
  }
}