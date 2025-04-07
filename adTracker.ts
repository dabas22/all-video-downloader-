import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AdUnlock {
  sessionId: string;
  url: string;
  unlockedAt: Date;
  expiresAt: Date;
}

export class AdTracker {
  private static readonly UNLOCK_DURATION = 3600000; // 1 hour
  private static readonly MIN_WATCH_TIME = 5000; // 5 seconds minimum watch time

  static async isUnlocked(sessionId: string, url: string): Promise<boolean> {
    const unlock = await prisma.adUnlock.findFirst({
      where: {
        sessionId,
        url,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
    return !!unlock;
  }

  static async trackAdWatch(sessionId: string, url: string, watchTime: number): Promise<boolean> {
    if (watchTime < this.MIN_WATCH_TIME) {
      return false;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.UNLOCK_DURATION);

    await prisma.adUnlock.upsert({
      where: {
        sessionId_url: {
          sessionId,
          url,
        },
      },
      update: {
        unlockedAt: now,
        expiresAt,
      },
      create: {
        sessionId,
        url,
        unlockedAt: now,
        expiresAt,
      },
    });

    return true;
  }

  static async getRemainingTime(sessionId: string, url: string): Promise<number> {
    const unlock = await prisma.adUnlock.findFirst({
      where: {
        sessionId,
        url,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!unlock) return 0;
    return unlock.expiresAt.getTime() - new Date().getTime();
  }
} 