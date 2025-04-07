import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RateLimitConfig {
  maxDownloads: number;
  windowMs: number;
}

const defaultConfig: RateLimitConfig = {
  maxDownloads: 3, // Maximum downloads per window
  windowMs: 3600000, // 1 hour window
};

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  async checkLimit(sessionId: string): Promise<{ allowed: boolean; remaining: number }> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.config.windowMs);

    // Count downloads in the current window
    const downloadCount = await prisma.downloadHistory.count({
      where: {
        sessionId,
        timestamp: {
          gte: windowStart,
          lte: now,
        },
      },
    });

    const remaining = Math.max(0, this.config.maxDownloads - downloadCount);
    return {
      allowed: remaining > 0,
      remaining,
    };
  }

  async recordDownload(sessionId: string, url: string, type: string): Promise<void> {
    await prisma.downloadHistory.create({
      data: {
        sessionId,
        url,
        type,
        mode: 'history',
        timestamp: new Date(),
      },
    });
  }
} 