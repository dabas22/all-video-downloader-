import axios from 'axios';
import { Redis } from 'ioredis';
import { AdTracker } from './adTracker';

const MAX_PART_SIZE = 5 * 1024 * 1024 * 1024; // 5GB in bytes
const MAX_CONCURRENT_DOWNLOADS = 5;
const DOWNLOAD_TIMEOUT = 30000; // 30 seconds

const redis = new Redis(process.env.REDIS_URL);

export interface FilePart {
  url: string;
  partNumber: number;
  size: number;
  totalParts: number;
}

export class FileSplitter {
  private static downloadQueue: Map<string, Promise<ArrayBuffer>> = new Map();
  private static activeDownloads: Set<string> = new Set();

  static async getFileSize(url: string): Promise<number> {
    const cacheKey = `file_size:${url}`;
    const cachedSize = await redis.get(cacheKey);
    
    if (cachedSize) {
      return parseInt(cachedSize, 10);
    }

    const response = await axios.head(url, {
      timeout: DOWNLOAD_TIMEOUT,
    });
    const size = parseInt(response.headers['content-length'], 10);
    
    await redis.setex(cacheKey, 3600, size.toString());
    return size;
  }

  static splitFile(fileSize: number): FilePart[] {
    const totalParts = Math.ceil(fileSize / MAX_PART_SIZE);
    const parts: FilePart[] = [];

    for (let i = 1; i <= totalParts; i++) {
      const start = (i - 1) * MAX_PART_SIZE;
      const end = Math.min(start + MAX_PART_SIZE, fileSize);
      parts.push({
        url: '',
        partNumber: i,
        size: end - start,
        totalParts,
      });
    }

    return parts;
  }

  private static async waitForSlot(): Promise<void> {
    while (this.activeDownloads.size >= MAX_CONCURRENT_DOWNLOADS) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  static async downloadPart(
    part: FilePart,
    sessionId: string,
    isSlow: boolean = false
  ): Promise<ArrayBuffer> {
    const downloadKey = `${part.url}#part${part.partNumber}`;
    
    // Check if download is already in progress
    if (this.downloadQueue.has(downloadKey)) {
      return this.downloadQueue.get(downloadKey)!;
    }

    // Check cache
    const cacheKey = `file_part:${downloadKey}`;
    const cachedPart = await redis.getBuffer(cacheKey);
    
    if (cachedPart) {
      return cachedPart;
    }

    // Wait for available download slot
    await this.waitForSlot();
    this.activeDownloads.add(downloadKey);

    try {
      const start = (part.partNumber - 1) * MAX_PART_SIZE;
      const end = start + part.size - 1;

      const downloadPromise = axios.get(part.url, {
        responseType: 'arraybuffer',
        headers: {
          Range: `bytes=${start}-${end}`,
        },
        timeout: DOWNLOAD_TIMEOUT,
        ...(isSlow && {
          onDownloadProgress: (progressEvent) => {
            return new Promise(resolve => setTimeout(resolve, 100));
          },
        }),
      }).then(async (response) => {
        const data = response.data;
        
        // Cache the downloaded part
        await redis.setex(cacheKey, 3600, data);
        
        return data;
      });

      this.downloadQueue.set(downloadKey, downloadPromise);
      const result = await downloadPromise;
      
      return result;
    } finally {
      this.activeDownloads.delete(downloadKey);
      this.downloadQueue.delete(downloadKey);
    }
  }

  static combineParts(parts: ArrayBuffer[]): Blob {
    return new Blob(parts);
  }
} 