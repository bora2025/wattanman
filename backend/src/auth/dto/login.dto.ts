import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  // Email address or phone number — AuthService.validateUser routes to whichever
  // column matches (looksLikeEmail), so this can't be a strict @IsEmail() check.
  @IsString()
  @MinLength(3)
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  // Required only when the account has MFA enabled (currently enforced for
  // PLATFORM_ADMIN — see AuthController.login and the conversion plan's Phase 2a).
  @IsOptional()
  @IsString()
  mfaCode?: string;
}
