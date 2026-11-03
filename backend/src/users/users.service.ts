import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateProfileDto, UpdateSettingsDto } from './users.dto.js';

const PROFILE_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  gender: true,
  birthDate: true,
  bio: true,
  targetLevel: true,
  role: true,
  locale: true,
  timezone: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const;

const SETTINGS_SELECT = {
  dailyNewWords: true,
  dailyGoalMinutes: true,
  dailyGoalCards: true,
  desiredRetention: true,
  showVietnamese: true,
  reminderEnabled: true,
  reminderTime: true,
  reminderChannels: true,
} as const;

function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(userId: string) {
    const { passwordHash, googleId, ...user } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { ...PROFILE_SELECT, passwordHash: true, googleId: true },
    });
    return {
      ...user,
      birthDate: user.birthDate?.toISOString().slice(0, 10) ?? null,
      // How this account can sign in (the hash and the Google id themselves never leave the server).
      hasPassword: passwordHash !== null,
      hasGoogle: googleId !== null,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.timezone !== undefined && !isTimeZone(dto.timezone)) {
      throw new BadRequestException(`Unknown timezone "${dto.timezone}"`);
    }
    if (dto.birthDate) {
      const date = new Date(`${dto.birthDate}T00:00:00Z`);
      if (date.getTime() > Date.now() || date.getUTCFullYear() < 1900) {
        throw new BadRequestException('birthDate is out of range');
      }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name?.trim(),
        gender: dto.gender,
        birthDate:
          dto.birthDate === undefined ? undefined : dto.birthDate === null ? null : new Date(`${dto.birthDate}T00:00:00Z`),
        bio: dto.bio === undefined ? undefined : dto.bio?.trim() || null,
        targetLevel: dto.targetLevel,
        locale: dto.locale,
        timezone: dto.timezone,
      },
    });
    return this.profile(userId);
  }

  settings(userId: string) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: SETTINGS_SELECT,
    });
  }

  updateSettings(userId: string, dto: UpdateSettingsDto) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
      select: SETTINGS_SELECT,
    });
  }

  async deleteAccount(userId: string) {
    // Every user-owned table cascades on delete (prisma/schema.prisma).
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
