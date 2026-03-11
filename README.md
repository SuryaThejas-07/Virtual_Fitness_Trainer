# AI Fit Coach

AI Fit Coach is a full-stack-style fitness web app (frontend + Firebase backend) that helps users train smarter with:

- Real-time AI posture tracking
- Workout and nutrition logging
- Health metrics monitoring (BMI, BMR, TDEE, body composition)
- Progress analytics and trends
- Motivational assistant chatbot with protein and goal coaching

Built with React, TypeScript, Vite, Tailwind, shadcn/ui, and Firebase.

## Features

### Core App
- Authentication (login/signup) with route protection
- Dashboard with live stats from Firestore
- Workout Tracker for manual workout logs
- Nutrition Tracker with today-only macro tracking
- Health Monitoring with body metrics log form and trend charts
- Progress Analytics with real data from workouts, nutrition, body metrics, and AI trainer sessions
- Profile page with automatic BMI/BMR/TDEE calculation

### AI Trainer
- Webcam-based pose detection
- Reps, posture score, calories estimation
- Live feedback and phase checks
- Session save to `ai_workout_analysis` collection

### Coach Chatbot
- Motivational replies
- Protein gap guidance and food suggestions
- Timed goal plans (for example, 60-day lean/muscle plans)
- Workout and food logging shortcuts in chat

## App Routes

- `/` Home
- `/login` Login
- `/signup` Signup
- `/dashboard` Dashboard
- `/ai-trainer` AI Trainer
- `/exercises` Exercise Guide
- `/workouts` Workout Tracker
- `/nutrition` Nutrition Tracker
- `/health` Health Monitoring
- `/analytics` Progress Analytics
- `/profile` My Profile

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Framer Motion
- Recharts
- Firebase Auth + Firestore
- Vitest

## Project Structure

```text
src/
	components/      Reusable UI and feature components
	contexts/        Auth context and providers
	hooks/           Firestore, pose detection, utility hooks
	lib/             Firebase setup and helper utilities
	pages/           Route-level pages
	test/            Test setup and specs
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install

```bash
npm install
```

### Run Dev Server

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Test

```bash
npm run test
```

### Lint

```bash
npm run lint
```

## Environment Setup

Copy `.env.example` to `.env.local` and update values:

```env
VITE_CHATBOT_API_KEY=your_key_here
VITE_CHATBOT_API_URL=https://api.openai.com/v1/chat/completions
VITE_CHATBOT_MODEL=gpt-4o-mini
```

Notes:

- If `VITE_CHATBOT_API_KEY` is empty, chatbot falls back to local rule-based responses.
- Any variable prefixed with `VITE_` is exposed to the browser.
- For production, do not keep private AI keys in frontend env vars. Use a backend proxy.

## Firebase Collections Used

- `users`
- `goals`
- `workouts`
- `nutrition`
- `body_metrics`
- `ai_workout_analysis`

## Screenshots

Add screenshots here before publishing:

- Home page
- Dashboard
- AI Trainer
- Nutrition Tracker
- Health Monitoring
- Progress Analytics

Example markdown:

```md
![Dashboard](./docs/screenshots/dashboard.png)
```

## Deployment

This is a Vite app and can be deployed easily to Vercel, Netlify, or Firebase Hosting.

### Generic Build Output
- Build command: `npm run build`
- Output directory: `dist`

## GitHub Export Checklist

Before pushing publicly:

1. Remove or rotate any real API keys from `.env.example` and local config.
2. Move Firebase config to environment variables if you want cleaner open-source hygiene.
3. Verify `.gitignore` excludes `.env.local`.
4. Run quality checks:

```bash
npm run lint
npm run build
npm run test
```

## Scripts

- `npm run dev` Start development server
- `npm run build` Production build
- `npm run build:dev` Development-mode build
- `npm run preview` Preview production build
- `npm run lint` ESLint checks
- `npm run test` Run tests once
- `npm run test:watch` Run tests in watch mode

## License

Add your preferred license (MIT recommended for public projects).
