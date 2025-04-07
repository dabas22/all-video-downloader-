# Universal Downloader

A full-stack web application that allows users to download various types of content (PDFs, music, photos, videos, etc.) with different download speed options.

## Features

- Automatic content type detection
- Two download modes:
  - History Mode: Saves download history (no login required)
  - Private Mode: No logs or history kept
- Download speed options:
  - Slow download (default)
  - Fast download (requires watching a short ad)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Initialize the database:
```bash
npx prisma generate
npx prisma db push
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Usage

1. Paste any URL containing downloadable content
2. Choose between History or Private mode
3. Select download speed:
   - Slow (default)
   - Fast (requires watching an ad)
4. Click Download

## Technologies Used

- Next.js
- TypeScript
- Prisma
- Tailwind CSS
- React Icons 