# AI Fit Coach

A modern fitness web app built with React, TypeScript, Vite, and Tailwind CSS.

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Firebase

## Getting Started

Requirements:

- Node.js 18+
- npm

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Chatbot API Key Setup

1. Copy `.env.example` to `.env.local`.
2. Set your key in `.env.local`:

```env
VITE_CHATBOT_API_KEY=your_api_key_here
VITE_CHATBOT_API_URL=https://api.openai.com/v1/chat/completions
VITE_CHATBOT_MODEL=gpt-4o-mini
```

3. Restart the dev server after editing env values.

Notes:

- If `VITE_CHATBOT_API_KEY` is empty, the chatbot uses built-in local responses.
- `VITE_*` variables are exposed in browser bundles. For private production keys, use a backend proxy.

## Project Structure

- `src/components`: shared UI and app components
- `src/pages`: route-level pages
- `src/contexts`: React context providers
- `src/hooks`: reusable hooks
- `src/lib`: shared utilities and integrations

## Notes

This repository is standalone and self-managed.
