# Bank Statement Analyzer

A production-ready Next.js app that extracts bank transactions from PDF statements and detects duplicates.

## Features

- 📄 PDF parsing for Indian bank statements (SBI, HDFC, ICICI, Axis)
- 🔍 Automatic duplicate detection by date + amount
- 🎨 Beautiful UI with Tailwind CSS + shadcn/ui
- 📊 Transaction table with highlighted duplicates
- 📥 Export clean CSV (duplicates removed)
- ⚡ Fast and responsive

## Quick Start (Windows)

### Just double-click:
```
RUN.bat
```

That's it! The script will:
- ✅ Install dependencies (first time only)
- ✅ Clear cache
- ✅ Start the server
- ✅ Open Chrome automatically

## How It Works

1. **Drop PDF**: Drag and drop your bank statement PDF
2. **Analysis**: Automatically extracts transactions and detects duplicates
3. **Review**: View results with duplicates highlighted in red
4. **Export**: Download clean CSV with duplicates resolved

## Duplicate Detection Logic

Transactions are considered duplicates if they have:
- **Same Date** (Posting Date)
- **Same Amount** (absolute value)
- Different descriptions are grouped together (e.g., FT codes)

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui + Radix UI
- **PDF Parsing**: pdf-parse
- **File Upload**: react-dropzone
- **Notifications**: sonner

## Project Structure

```
├── app/
│   ├── api/analyze/route.ts    # PDF parsing API
│   ├── page.tsx                # Main UI
│   ├── layout.tsx              # Root layout
│   └── globals.css             # Global styles
├── components/ui/              # Reusable UI components
├── lib/utils.ts                # Utility functions
├── dev.bat                     # Development server
├── start.bat                   # Production server
└── setup.bat                   # Initial setup
```

## Manual Commands

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build

# Start production server
npm start
```

## Supported PDF Format

The parser expects bank statements with this structure:

```
Serial | Date       | Date       | Ref      | Description | Debit     | Credit    | Balance
315    | 19/11/2025 | 19/11/2025 | FT12345  | NEFT TXN    | 2,550.121 | 0         | 364,861.639
```

Works with:
- Pipe-separated or space-separated columns
- Comma as thousand separator
- DD/MM/YYYY date format

## Troubleshooting

**Port already in use?**
```bash
# Kill process on port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Dependencies missing?**
```bash
setup.bat
```

**Build errors?**
```bash
npm run build
```

## License

MIT

