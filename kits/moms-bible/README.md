# Mom's Bible Kit

A senior-friendly, mobile-first KJV Bible application for jengaKIT.

## Features

- **Read**: Elegant KJV reading experience with adjustable font sizes (20px-40px).
- **Save**: Bookmark verses for quick access.
- **Menu**: Simple, large-button interface for navigation and settings.
- **Offline**: Works without an internet connection using IndexedDB and PWA technology.
- **Accessible**: High-contrast text (Deep Charcoal on Parchment) and 48px+ touch targets.

## Implementation Details

- **Template-First Strategy**: Core reading logic and data structures are protected.
- **Customization**: The LLM can generate a personalized `src/app/custom-landing.tsx` based on user prompts.
- **Data Architecture**: Bible books are chunked into JSON files for fast, on-demand loading.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State/Storage**: Dexie (IndexedDB)
- **Icons**: Lucide-React
- **Offline**: next-pwa

## Validation

This kit has been validated using `scripts/validate-all-kits.py` and follows all jengaKIT port and container standards.
