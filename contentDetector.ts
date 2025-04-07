import axios from 'axios';

export type ContentType = 'file' | 'video' | 'audio' | 'image' | 'torrent';

export interface ContentInfo {
  type: ContentType;
  size: number;
  isLargeFile: boolean;
}

export async function detectContentType(url: string): Promise<ContentInfo> {
  try {
    // Check for torrent files
    if (url.endsWith('.torrent') || url.startsWith('magnet:?')) {
      return {
        type: 'torrent',
        size: 0,
        isLargeFile: false
      };
    }

    const response = await axios.head(url);
    const contentType = response.headers['content-type'];
    const contentLength = parseInt(response.headers['content-length'] || '0', 10);
    
    // Check if file is large (5GB or more)
    const isLargeFile = contentLength >= 5 * 1024 * 1024 * 1024;

    // Check content type from headers
    if (contentType?.includes('video/')) {
      return {
        type: 'video',
        size: contentLength,
        isLargeFile
      };
    } else if (contentType?.includes('audio/')) {
      return {
        type: 'audio',
        size: contentLength,
        isLargeFile
      };
    } else if (contentType?.includes('image/')) {
      return {
        type: 'image',
        size: contentLength,
        isLargeFile
      };
    }

    // If we can't determine from headers, try to get a small sample
    const sampleResponse = await axios.get(url, {
      responseType: 'arraybuffer',
      maxContentLength: 1024 * 1024 // 1MB sample
    });

    const buffer = new Uint8Array(sampleResponse.data);
    
    // Check for torrent magic number
    const magicNumber = Array.from(buffer.slice(0, 8))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    
    if (magicNumber === '64383a616e6e6f756e6365') {
      return {
        type: 'torrent',
        size: contentLength,
        isLargeFile
      };
    }

    return {
      type: 'file',
      size: contentLength,
      isLargeFile
    };
  } catch (error) {
    console.error('Error detecting content type:', error);
    return {
      type: 'file',
      size: 0,
      isLargeFile: false
    };
  }
} 