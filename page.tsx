'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FaDownload, FaHistory, FaLock, FaBolt, FaTachometerAlt, FaMagnet, FaFileAlt } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { SessionManager } from './utils/sessionManager';
import { detectContentType, ContentInfo } from './utils/contentDetector';

// Debounce function to limit API calls
const debounce = (func: Function, wait: number) => {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

interface TorrentInfo {
  type: 'torrent';
  url: string;
  name: string;
}

interface LargeFileInfo {
  type: 'large_file';
  totalSize: number;
  suggestedPartSize: number;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'normal' | 'history'>('normal');
  const [isLoading, setIsLoading] = useState(false);
  const [downloadSpeed, setDownloadSpeed] = useState<'slow' | 'fast'>('slow');
  const [showAd, setShowAd] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState('');
  const [adProgress, setAdProgress] = useState(0);
  const [error, setError] = useState('');
  const [torrentInfo, setTorrentInfo] = useState<TorrentInfo | null>(null);
  const [largeFileInfo, setLargeFileInfo] = useState<LargeFileInfo | null>(null);
  const [currentPart, setCurrentPart] = useState(1);
  const [totalParts, setTotalParts] = useState(1);
  const [partUnlocked, setPartUnlocked] = useState<Record<number, boolean>>({});
  const [retryCount, setRetryCount] = useState(0);
  const [isLargeFile, setIsLargeFile] = useState(false);
  const MAX_RETRIES = 3;

  // Debounced URL validation
  const validateUrl = useCallback(
    debounce(async (url: string) => {
      if (!url) return;
      
      try {
        const response = await fetch('/api/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        
        if (!response.ok) {
          setError('Invalid URL or resource not available');
        }
      } catch (err) {
        setError('Failed to validate URL');
      }
    }, 500),
    []
  );

  useEffect(() => {
    validateUrl(url);
  }, [url, validateUrl]);

  // Simulate download progress
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isLoading) {
      interval = setInterval(() => {
        setDownloadProgress((prev: number) => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + (downloadSpeed === 'fast' ? 10 : 2);
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isLoading, downloadSpeed]);

  // Simulate ad progress
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (showAd) {
      interval = setInterval(() => {
        setAdProgress((prev: number) => {
          if (prev >= 100) {
            clearInterval(interval);
            handleAdComplete();
            return 100;
          }
          return prev + 20; // 5 seconds total
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [showAd]);

  // Calculate estimated time
  useEffect(() => {
    if (downloadProgress > 0 && downloadProgress < 100) {
      const remaining = 100 - downloadProgress;
      const speed = downloadSpeed === 'fast' ? 10 : 2;
      const seconds = Math.ceil(remaining / speed);
      setEstimatedTime(`${seconds} seconds remaining`);
    } else {
      setEstimatedTime('');
    }
  }, [downloadProgress, downloadSpeed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    setTorrentInfo(null);
    setLargeFileInfo(null);
    setDownloadProgress(0);

    if (downloadSpeed === 'fast' && !partUnlocked[currentPart]) {
      setShowAd(true);
      return;
    }

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          mode,
          downloadSpeed,
          sessionId: localStorage.getItem('sessionId'),
          partSize: largeFileInfo ? currentPart : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        if (response.status === 429 && retryCount < MAX_RETRIES) {
          const backoffTime = Math.pow(2, retryCount) * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          setRetryCount((prev: number) => prev + 1);
          handleSubmit(e);
          return;
        }
        
        throw new Error(errorData.error || 'Download failed');
      }

      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        const data = await response.json();
        
        if (data.type === 'torrent') {
          setTorrentInfo(data);
          setIsLargeFile(false);
        } else if (data.type === 'large_file') {
          setLargeFileInfo(data);
          setTotalParts(Math.ceil(data.totalSize / data.suggestedPartSize));
          setPartUnlocked({});
          setIsLargeFile(true);
        }
      } else {
        // Handle file download
        const contentInfo = await detectContentType(url);
        setIsLargeFile(contentInfo.isLargeFile);
        
        if (!contentInfo.isLargeFile && mode === 'history') {
          setError('History mode is only available for files larger than 5GB');
          setIsLoading(false);
          return;
        }
        
        // Continue with download...
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsLoading(false);
      setRetryCount(0);
    }
  };

  const handleAdComplete = async () => {
    setShowAd(false);
    setPartUnlocked((prev: Record<number, boolean>) => ({
      ...prev,
      [currentPart]: true,
    }));
    handleSubmit(new Event('submit') as any);
  };

  const handleNextPart = () => {
    if (currentPart < totalParts) {
      setCurrentPart((prev: number) => prev + 1);
      handleSubmit(new Event('submit') as any);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md mx-auto bg-white rounded-xl shadow-lg p-8"
      >
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">Universal Downloader</h1>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Download Mode</label>
          <div className="flex items-center space-x-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMode('history')}
              className={`flex-1 flex items-center justify-center px-4 py-2 rounded-lg transition-colors ${
                mode === 'history' 
                  ? 'bg-blue-500 text-white shadow-md' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${!isLargeFile ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!isLargeFile}
              title={!isLargeFile ? 'History mode is only available for files larger than 5GB' : ''}
            >
              <FaHistory className="mr-2" />
              History Mode
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMode('normal')}
              className={`flex-1 flex items-center justify-center px-4 py-2 rounded-lg transition-colors ${
                mode === 'normal' 
                  ? 'bg-blue-500 text-white shadow-md' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <FaLock className="mr-2" />
              Normal Mode
            </motion.button>
          </div>
          {!isLargeFile && mode === 'history' && (
            <p className="mt-2 text-sm text-red-500">
              History mode is only available for files larger than 5GB
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
              Paste your URL
            </label>
            <motion.input
              whileFocus={{ scale: 1.01 }}
              type="url"
              id="url"
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              placeholder="https://example.com/file.pdf"
              required
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <motion.input
                  whileTap={{ scale: 0.95 }}
                  type="checkbox"
                  id="fastDownload"
                  checked={downloadSpeed === 'fast'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDownloadSpeed(e.target.checked ? 'fast' : 'slow')}
                  className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="fastDownload" className="ml-2 block text-sm text-gray-900">
                  Enable fast download
                </label>
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <FaTachometerAlt className="mr-1" />
                {downloadSpeed === 'fast' ? 'Fast (10MB/s)' : 'Slow (100KB/s)'}
              </div>
            </div>

            <AnimatePresence>
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <motion.div 
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                      style={{ width: `${downloadProgress}%` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${downloadProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>{downloadProgress}%</span>
                    <span>{estimatedTime}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center">
                <FaBolt className="mr-2 animate-pulse" />
                Downloading...
              </span>
            ) : (
              <span className="flex items-center">
                <FaDownload className="mr-2" />
                Download
              </span>
            )}
          </motion.button>
        </form>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-red-100 text-red-700 rounded-lg"
          >
            {error}
          </motion.div>
        )}

        {torrentInfo && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-blue-50 rounded-lg"
          >
            <div className="flex items-center">
              <FaMagnet className="text-blue-500 mr-2" />
              <h3 className="text-lg font-semibold text-blue-700">Torrent File Detected</h3>
            </div>
            <p className="mt-2 text-sm text-blue-600">
              This is a torrent file. You can use your preferred torrent client to download it.
            </p>
            <div className="mt-4">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-500 hover:text-blue-700"
              >
                Open torrent file
              </a>
            </div>
          </motion.div>
        )}

        {largeFileInfo && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 p-6 bg-gray-800 rounded-lg shadow-lg"
          >
            <div className="flex items-center gap-4 mb-4">
              <FaFileAlt className="text-3xl text-blue-500" />
              <h3 className="text-xl font-semibold">Large File Detected</h3>
            </div>
            <p className="mb-4">
              This file is too large to download at once. It will be split into {totalParts} parts.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                {downloadSpeed === 'fast' && !partUnlocked[currentPart] ? (
                  'Watch Ad to Unlock Fast Download'
                ) : (
                  `Download Part ${currentPart} of ${totalParts}`
                )}
              </button>
              {currentPart < totalParts && (
                <button
                  onClick={handleNextPart}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                >
                  Next Part
                </button>
              )}
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {showAd && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white p-6 rounded-lg max-w-md w-full mx-4"
              >
                <h3 className="text-xl font-semibold mb-4">Watch Ad for Fast Download</h3>
                <div className="aspect-video bg-gray-200 rounded-lg mb-4 flex items-center justify-center">
                  <span className="text-gray-500">Ad Video Player</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                  <motion.div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                    style={{ width: `${adProgress}%` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${adProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleAdComplete}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Complete Ad & Download
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  );
}  