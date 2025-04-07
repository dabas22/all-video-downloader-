import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { detectContentType } from '@/app/utils/contentDetector';
import { RateLimiter } from '@/app/utils/rateLimiter';
import { AdTracker } from '@/app/utils/adTracker';
import { FileSplitter } from '@/app/utils/fileSplitter';
import { DownloadLimiter } from '@/app/utils/downloadLimiter';
import { Redis } from 'ioredis';

const prisma = new PrismaClient();
const rateLimiter = new RateLimiter();
const redis = new Redis(process.env.REDIS_URL);

// Cache duration in seconds
const CACHE_DURATION = 3600; // 1 hour

export async function POST(request: Request) {
  try {
    const { url, mode, downloadSpeed, sessionId, partSize } = await request.json();
    
    // Validate URL
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Check download limit
    const { allowed: canDownload, remaining } = await DownloadLimiter.checkDownloadLimit(sessionId);
    if (!canDownload) {
      return NextResponse.json(
        { 
          error: 'Download limit reached. Watch an ad to continue downloading.',
          remaining,
          limit: 5,
        },
        { status: 429 }
      );
    }

    // Check rate limit for all requests
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const rateLimitKey = `rate_limit:${ip}`;
    const rateLimit = await redis.incr(rateLimitKey);
    
    if (rateLimit === 1) {
      await redis.expire(rateLimitKey, 60); // Reset every minute
    }
    
    if (rateLimit > 100) { // 100 requests per minute per IP
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Check if fast download is unlocked for this part
    if (downloadSpeed === 'fast') {
      const partUrl = `${url}#part${partSize}`;
      const isUnlocked = await AdTracker.isUnlocked(sessionId, partUrl);
      if (!isUnlocked) {
        return NextResponse.json(
          { error: 'Fast download not unlocked for this part. Please watch the ad first.' },
          { status: 403 }
        );
      }
    }

    // Check rate limit for history mode
    if (mode === 'history') {
      const { allowed, remaining } = await rateLimiter.checkLimit(sessionId);
      if (!allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded', remaining },
          { status: 429 }
        );
      }
    }

    // Check cache for file info
    const cacheKey = `file_info:${url}`;
    let fileInfo = await redis.get(cacheKey);
    
    if (!fileInfo) {
      // Detect content type
      const contentType = await detectContentType(url);
      
      // Special handling for torrent files
      if (contentType === 'torrent') {
        const torrentInfo = {
          url,
          type: 'torrent',
          mode,
          sessionId,
          timestamp: new Date().toISOString(),
        };

        await rateLimiter.recordDownload(sessionId, url, contentType);
        await DownloadLimiter.recordDownload(sessionId, url, 'torrent');
        await redis.setex(cacheKey, CACHE_DURATION, JSON.stringify(torrentInfo));

        return NextResponse.json(torrentInfo, {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }

      // Check file size and handle splitting if needed
      const fileSize = await FileSplitter.getFileSize(url);
      const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

      if (fileSize > MAX_SIZE) {
        if (!partSize) {
          const largeFileInfo = {
            type: 'large_file',
            url,
            totalSize: fileSize,
            suggestedPartSize: MAX_SIZE,
            canSplit: true,
            totalParts: Math.ceil(fileSize / MAX_SIZE),
          };
          
          await redis.setex(cacheKey, CACHE_DURATION, JSON.stringify(largeFileInfo));
          
          return NextResponse.json(largeFileInfo, {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }

        // Download specific part with speed control
        const part = await FileSplitter.downloadPart({
          url,
          partNumber: parseInt(partSize, 10),
          size: MAX_SIZE,
          totalParts: Math.ceil(fileSize / MAX_SIZE),
        }, sessionId, downloadSpeed === 'slow');

        // Record download in history if in history mode
        if (mode === 'history') {
          await rateLimiter.recordDownload(sessionId, `${url}#part${partSize}`, contentType);
        }

        // Record part download
        await DownloadLimiter.recordDownload(sessionId, url, 'part', parseInt(partSize, 10));

        return new NextResponse(part, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="part_${partSize}.zip"`,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
      
      // Download the file
      const fileResponse = await axios.get(url, {
        responseType: 'arraybuffer',
        ...(downloadSpeed === 'slow' && {
          onDownloadProgress: (progressEvent) => {
            return new Promise(resolve => setTimeout(resolve, 100));
          },
        }),
      });

      // Record download in history if in history mode
      if (mode === 'history') {
        await rateLimiter.recordDownload(sessionId, url, contentType);
      }

      // Record file download
      await DownloadLimiter.recordDownload(sessionId, url, 'file');

      // Cache the file info
      await redis.setex(cacheKey, CACHE_DURATION, JSON.stringify({
        type: 'file',
        url,
        contentType: fileResponse.headers['content-type'],
        size: fileResponse.data.length,
      }));

      // Return the file
      return new NextResponse(fileResponse.data, {
        headers: {
          'Content-Type': fileResponse.headers['content-type'],
          'Content-Disposition': `attachment; filename="downloaded_file.${contentType}"`,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Return cached response
    return NextResponse.json(JSON.parse(fileInfo), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
} 