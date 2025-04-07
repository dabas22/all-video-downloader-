import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL);

export class DownloadLimiter {
  static async checkDownloadLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
    // Always allow downloads
    return {
      allowed: true,
      remaining: Infinity,
    };
  }

  static async recordDownload(
    userId: string,
    url: string,
    type: string,
    partNumber?: number
  ): Promise<void> {
    // Only record download in database for history
    await prisma.userDownloads.create({
      data: {
        userId,
        url,
        type,
        partNumber,
      },
    });
  }

  static async resetDownloads(userId: string): Promise<void> {
    // No need to reset anything since there are no limits
    return;
  }
} 