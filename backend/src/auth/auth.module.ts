import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { DatabaseModule } from '../database/database.module';
import { AuthDeliveryService } from './auth-delivery.service';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [
    DatabaseModule,
    SecurityModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-me-in-production-use-a-strong-random-key',
      signOptions: { expiresIn: '8h' },
    }),
  ],
  providers: [AuthService, AuthDeliveryService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, AuthDeliveryService],
})
export class AuthModule {}
