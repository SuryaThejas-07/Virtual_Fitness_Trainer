# Virtual Fitness Trainer

An AI-first fitness platform built from passion.

AI Fit Coach is designed for people who want more than a workout timer. It gives real-time form feedback, tracks training and nutrition, and turns your daily effort into measurable progress.

Built with React, TypeScript, Vite, Tailwind, shadcn/ui, and Firebase.

## 🌟 Why This Project Matters

This is not just another tracker UI. The goal is to make training smarter for real users:

- Better form, not just higher rep counts
- Guidance while exercising, not only after
- Data-backed progress from workouts, nutrition, and body metrics
- A coach-like assistant that motivates and helps users stay consistent

## 🤖 AI Trainer (Core Feature)

The AI Trainer is the heart of the app.

It analyzes movement from webcam input and decides whether each rep should count based on form quality and exercise rules.

### What the AI Trainer does

- Real-time exercise detection via camera
- Rep counting with quality gates
- Posture score calculation
- Calorie estimate + session timer
- Live coaching feedback during movement
- Camera distance and low-light diagnostics
- Session persistence into Firestore (`ai_workout_analysis`)

### Supported exercises

- Squat
- Pushup
- Biceps Curl
- Lunge
- Jumping Jack
- Plank

### AI session flow

1. Select exercise on `/ai-trainer`
2. Start camera
3. AI evaluates visibility, movement phase, and posture thresholds
4. Only valid reps/holds are counted
5. Stop session and save analytics data

## 🚀 Product Features

### Training + Tracking
- Dashboard with live fitness summary
- Workout Tracker for manual sessions
- Health Monitoring with BMI/body composition trends
- Progress Analytics using real Firestore data

### Nutrition + Goals
- Nutrition Tracker with daily macros
- Goal-based calorie/protein targets
- Body metrics logging for weight/body fat/muscle trends

### Coach Chatbot
- Motivational coaching replies
- Protein-gap food suggestions
- Timed goal plans (for example, 60-day lean plan)
- Quick workout/food logging from chat

## 🧭 App Routes

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

## 🧱 Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Framer Motion
- Recharts
- Firebase Auth + Firestore
- Vitest

## 📂 Project Structure

```text
src/
  components/      Reusable UI and feature components
  contexts/        Auth providers and session state
  hooks/           Firestore, pose detection, utility hooks
  lib/             Firebase setup and shared helpers
  pages/           Route-level app pages
  test/            Test setup and test files
```

## ⚙️ Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install

```bash
npm install
```

### Run locally

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

## 🔐 Environment Setup

For GitHub/public users:

1. Copy `.env.github.example` to `.env.local`
2. Fill your own keys

```env
VITE_CHATBOT_API_KEY=your_key_here
VITE_CHATBOT_API_URL=https://api.openai.com/v1/chat/completions
VITE_CHATBOT_MODEL=gpt-4o-mini
```

Notes:

- `.env.example` can stay as maintainer/internal template
- `.env.github.example` is the safe public template
- If `VITE_CHATBOT_API_KEY` is empty, chatbot falls back to local responses
- `VITE_*` variables are exposed in browser bundles

## 🗃️ Firestore Collections

- `users`
- `goals`
- `workouts`
- `nutrition`
- `body_metrics`
- `ai_workout_analysis`

## ☁️ Deployment

This is a Vite app and can be deployed to Vercel, Netlify, or Firebase Hosting.

- Build command: `npm run build`
- Output folder: `dist`

## ✅ Public Release Checklist

1. Keep real secrets only in local files (`.env.local`)
2. Share only `.env.github.example` for contributors
3. Verify `.gitignore` excludes secret files
4. Run:

```bash
npm run lint
npm run build
npm run test
```

## 🛠️ Scripts

- `npm run dev` Development server
- `npm run build` Production build
- `npm run build:dev` Development-mode build
- `npm run preview` Preview production build
- `npm run lint` ESLint checks
- `npm run test` Run tests once
- `npm run test:watch` Run tests in watch mode

## ❤️ Final Note

AI Fit Coach is built as a serious, long-term product vision: practical AI, strong UX, and meaningful fitness outcomes.

If you are here to contribute, welcome.
