import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { addFirestoreDoc } from "@/hooks/useFirestore";
import { serverTimestamp } from "firebase/firestore";
import { useFirestoreCollection, useGoals } from "@/hooks/useFirestore";
import trainerAvatar from "@/assets/trainer-avatar.png";

type Message = { role: "user" | "assistant"; content: string };
type ApiMessage = { role: "system" | "user" | "assistant"; content: string };
type ActivityName = "Squat" | "Pushup" | "Lunge" | "Biceps Curl" | "Jumping Jack" | "Plank";

interface ActivityLog {
  name: ActivityName;
  reps: number;
  timestamp: number;
}

interface ActivityEstimate {
  durationMinutes: number;
  calories: number;
}

interface NutritionEntry {
  id: string;
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  meal_type: string;
  date?: unknown;
}

interface WorkoutEntry {
  id: string;
  exercise_name: string;
  reps: number;
  sets: number;
  calories_burned: number;
  duration_minutes: number;
  timestamp?: unknown;
}

interface FoodMacro {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

interface GoalEntry {
  daily_calories?: number;
  protein_target_g?: number;
  carbs_target_g?: number;
  fats_target_g?: number;
}

const CHATBOT_API_KEY = import.meta.env.VITE_CHATBOT_API_KEY;
const CHATBOT_API_URL = import.meta.env.VITE_CHATBOT_API_URL ?? "https://api.openai.com/v1/chat/completions";
const CHATBOT_MODEL = import.meta.env.VITE_CHATBOT_MODEL ?? "gpt-4o-mini";
const ACTIVITY_STORAGE_KEY = "coach-ai-activity-log";
const FOOD_STORAGE_KEY = "coach-ai-food-log";

const ACTIVITY_MATCHERS: Array<{ name: ActivityName; pattern: RegExp }> = [
  { name: "Squat", pattern: /\b(squat|squats)\b/i },
  { name: "Pushup", pattern: /\b(pushup|pushups|push-up|push-ups)\b/i },
  { name: "Lunge", pattern: /\b(lunge|lunges)\b/i },
  { name: "Biceps Curl", pattern: /\b(curl|curls|biceps curl|bicep curl)\b/i },
  { name: "Jumping Jack", pattern: /\b(jumping jack|jumping jacks|jack|jacks)\b/i },
  { name: "Plank", pattern: /\b(plank|planks)\b/i },
];

const ACTIVITY_ALIASES: Record<ActivityName, string[]> = {
  Squat: ["squat", "squats"],
  Pushup: ["pushup", "pushups", "push-up", "push-ups", "push"],
  Lunge: ["lunge", "lunges"],
  "Biceps Curl": ["curl", "curls", "bicep", "biceps", "bicepcurl", "bicepscurl"],
  "Jumping Jack": ["jumping", "jack", "jacks", "jumpingjack", "jumpingjacks"],
  Plank: ["plank", "planks"],
};

const PAGE_INFO: Array<{ name: string; pattern: RegExp; description: string }> = [
  {
    name: "Home",
    pattern: /\b(home|home page|landing)\b/i,
    description:
      "The **Home** page is your starting point. It gives a quick overview and lets you jump to training, tracking, and analytics features.",
  },
  {
    name: "Dashboard",
    pattern: /\b(dashboard)\b/i,
    description:
      "The **Dashboard** shows your daily fitness snapshot, including key stats like reps, calories, and progress highlights.",
  },
  {
    name: "AI Trainer",
    pattern: /\b(ai trainer|trainer page|workout tracker camera)\b/i,
    description:
      "The **AI Trainer** page uses your webcam to detect movement, evaluate form, and count reps in real time.",
  },
  {
    name: "Exercises",
    pattern: /\b(exercise guide|exercises page|exercise page)\b/i,
    description:
      "The **Exercises** page explains each movement with guidance so you can learn proper form before doing live tracking.",
  },
  {
    name: "Workouts",
    pattern: /\b(workout page|workouts page|workout plan)\b/i,
    description:
      "The **Workouts** page helps you view and follow workout routines and plan your training sessions.",
  },
  {
    name: "Nutrition",
    pattern: /\b(nutrition|meal page|food tracker)\b/i,
    description:
      "The **Nutrition** page lets you log meals and track protein, carbs, fats, and calories against your goals.",
  },
  {
    name: "Health",
    pattern: /\b(health monitoring|health page|bmi page|body fat)\b/i,
    description:
      "The **Health** page tracks metrics like BMI, body fat, and related body composition indicators.",
  },
  {
    name: "Analytics",
    pattern: /\b(analytics|progress page|charts|trend)\b/i,
    description:
      "The **Analytics** page shows trends and charts so you can monitor workout consistency and fitness progress over time.",
  },
];

const RULE_BASED_RESPONSES: Array<{ pattern: RegExp; response: string }> = [
  {
    pattern: /\b(workout|train|training|ai trainer)\b/i,
    response:
      "To start a workout, head to the **AI Trainer** page. Your webcam tracks movement in real time and the coach guides your form while counting reps.",
  },
  {
    pattern: /\b(pushup|push-up|squat|lunge|curl|plank|exercise|form)\b/i,
    response:
      "For a pushup: keep a straight plank line, lower until elbows are about 90 degrees, then press back up. Keep core tight and avoid hip sag.",
  },
  {
    pattern: /\b(protein.*chicken wings|chicken wings.*protein)\b/i,
    response:
      "Chicken wings typically have about **6-9g protein per wing** (depending on size and skin/sauce). For 100g cooked wings, protein is often around **23-30g**.",
  },
  {
    pattern: /\b(protein|meal|nutrition|calorie|macro|diet|food)\b/i,
    response:
      "For nutrition, I can estimate calories/macros and suggest meal ideas. Example target: each meal can include lean protein + vegetables + a controlled carb source.",
  },
  {
    pattern: /\b(analytics|progress|report|chart)\b/i,
    response:
      "Go to **Analytics** to view trends for workouts, calories, and health progress over time.",
  },
  {
    pattern: /\b(bmi|health|body fat|muscle mass)\b/i,
    response:
      "Open **Health Monitoring** to check BMI, body fat, muscle mass, and calorie requirements.",
  },
  {
    pattern: /\b(hello|hi|hey)\b/i,
    response:
      "Hey! I am Coach AI. Ask me about workouts, exercise form, nutrition, calories, or progress tracking.",
  },
  {
    pattern: /\b(help|what can you do|support)\b/i,
    response:
      "I can help with workouts, form tips, nutrition tracking, and finding the right page in the app. Ask me anything fitness-related.",
  },
];

const FALLBACK_VARIATIONS = [
  "I can help with workouts, form tips, nutrition tracking, and app navigation. Try asking about pushups, protein intake, or your training plan.",
  "Ask me about exercise technique, calories, protein goals, or where to find features in FitAI Pro.",
  "I can coach you on training basics, meal tracking, and progress analytics. What is your current goal?",
];

const MOTIVATIONAL_QUOTES = [
  "Every rep counts. You're building a better version of yourself one workout at a time. Keep pushing! 🔥",
  "Consistency beats intensity. Show up every day and the results WILL follow. You've got this! 💪",
  "Your only competition is who you were yesterday. Let's crush it today! 🏆",
  "Champions are made in the moments they want to quit but don't. Stay strong — you're almost there! ⚡",
  "Rome wasn't built in a day, but they were laying bricks every hour. Keep stacking those reps! 🧱",
  "Pain is temporary, but the feeling of achievement lasts forever. Push through! 🌟",
  "Every workout is one step closer to your goal. Small steps, massive results. Don't stop now! 🎯",
  "Your future self will thank you for the effort you put in TODAY. Make it count! 🙌",
  "The hardest part is showing up. You already did that — now finish strong! 💥",
  "Progress, not perfection. You're doing amazing. Keep that momentum going! 🚀",
  "Sore today, stronger tomorrow. That burn means it's working! 🔥",
  "What seems hard now will one day be your warm-up. Trust the process! 💯",
];

function getMotivationalQuote(seed?: number): string {
  const idx =
    seed !== undefined
      ? Math.abs(seed) % MOTIVATIONAL_QUOTES.length
      : Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
  return MOTIVATIONAL_QUOTES[idx];
}

const FOOD_MACRO_DB: Record<string, FoodMacro> = {
  "chicken breast": { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
  "chicken wings": { calories: 290, protein: 27, carbs: 0, fats: 19 },
  egg: { calories: 143, protein: 12.6, carbs: 1.1, fats: 9.5 },
  rice: { calories: 130, protein: 2.7, carbs: 28, fats: 0.3 },
  oats: { calories: 389, protein: 16.9, carbs: 66.3, fats: 6.9 },
  banana: { calories: 89, protein: 1.1, carbs: 23, fats: 0.3 },
  apple: { calories: 52, protein: 0.3, carbs: 14, fats: 0.2 },
  salmon: { calories: 208, protein: 20, carbs: 0, fats: 13 },
  tuna: { calories: 132, protein: 29, carbs: 0, fats: 1 },
  bread: { calories: 265, protein: 9, carbs: 49, fats: 3.2 },
  milk: { calories: 61, protein: 3.2, carbs: 4.8, fats: 3.3 },
  yogurt: { calories: 59, protein: 10, carbs: 3.6, fats: 0.4 },
  paneer: { calories: 265, protein: 18, carbs: 1.2, fats: 21 },
  tofu: { calories: 76, protein: 8, carbs: 1.9, fats: 4.8 },
  potato: { calories: 77, protein: 2, carbs: 17, fats: 0.1 },
};

function getResponse(input: string): string {
  const asksAboutPage = /\b(about|what is|what does|explain|tell me about)\b/i.test(input) && /\b(page|screen|tab)\b/i.test(input);
  if (asksAboutPage) {
    for (const page of PAGE_INFO) {
      if (page.pattern.test(input)) return page.description;
    }
    return "Tell me which page you mean (Home, Dashboard, AI Trainer, Exercises, Workouts, Nutrition, Health, or Analytics), and I will explain it clearly.";
  }

  for (const item of RULE_BASED_RESPONSES) {
    if (item.pattern.test(input)) return item.response;
  }

  const index = Math.abs(input.length + input.charCodeAt(0)) % FALLBACK_VARIATIONS.length;
  return FALLBACK_VARIATIONS[index];
}

function parseActivityInput(input: string): { name: ActivityName; reps: number } | null {
  const normalized = input.toLowerCase();
  const numberMatch = normalized.match(/\b(\d{1,4})\b/);
  if (!numberMatch) return null;

  const reps = Number(numberMatch[1]);
  if (!Number.isFinite(reps) || reps <= 0) return null;

  for (const item of ACTIVITY_MATCHERS) {
    if (item.pattern.test(normalized)) {
      return { name: item.name, reps };
    }
  }

  const detectByTypoTolerance = (text: string): ActivityName | null => {
    const sanitize = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
    const words = text
      .split(/\s+/)
      .map(sanitize)
      .filter((w) => w.length >= 3);

    const distance = (a: string, b: string): number => {
      const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
      for (let i = 0; i <= a.length; i++) dp[i][0] = i;
      for (let j = 0; j <= b.length; j++) dp[0][j] = j;
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
      }
      return dp[a.length][b.length];
    };

    const maxAllowedDistance = (len: number) => {
      if (len <= 4) return 1;
      if (len <= 8) return 2;
      return 3;
    };

    let best: { name: ActivityName; score: number } | null = null;

    for (const [name, aliases] of Object.entries(ACTIVITY_ALIASES) as Array<[ActivityName, string[]]>) {
      for (const alias of aliases) {
        const aliasNorm = sanitize(alias);
        if (!aliasNorm) continue;
        for (const token of words) {
          const d = distance(token, aliasNorm);
          if (d <= maxAllowedDistance(aliasNorm.length)) {
            if (!best || d < best.score) {
              best = { name, score: d };
            }
          }
        }
      }
    }

    return best?.name ?? null;
  };

  const fuzzyDetected = detectByTypoTolerance(normalized);
  if (fuzzyDetected) {
    return { name: fuzzyDetected, reps };
  }

  return null;
}

function readStoredActivities(): ActivityLog[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActivityLog[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.reps === "number" && typeof item.name === "string");
  } catch {
    return [];
  }
}

function writeStoredActivities(logs: ActivityLog[]): void {
  try {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // Ignore storage errors (private mode/quota), chatbot still functions.
  }
}

function addActivityLog(entry: { name: ActivityName; reps: number }): ActivityLog[] {
  const logs = readStoredActivities();
  const next: ActivityLog = {
    name: entry.name,
    reps: entry.reps,
    timestamp: Date.now(),
  };
  const updated = [...logs, next].slice(-200);
  writeStoredActivities(updated);
  return updated;
}

function summarizeActivities(logs: ActivityLog[]): string {
  if (logs.length === 0) {
    return "No activities logged yet. Try: `I did 20 squats` or `completed 15 pushups`.";
  }

  const totals = new Map<ActivityName, number>();
  for (const log of logs) {
    totals.set(log.name, (totals.get(log.name) ?? 0) + log.reps);
  }

  const lines = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, reps]) => `- ${name}: ${reps} reps`);

  const totalReps = [...totals.values()].reduce((a, b) => a + b, 0);

  return [
    "Great work. Here is your tracked activity:",
    ...lines,
    `Total: ${totalReps} reps`,
    "Coach tip: keep posture quality high and increase reps gradually week by week.",
  ].join("\n");
}

function getActivitySummaryForPrompt(logs: ActivityLog[]): string {
  if (logs.length === 0) return "No user activity logs yet.";
  const totals = new Map<ActivityName, number>();
  for (const log of logs) {
    totals.set(log.name, (totals.get(log.name) ?? 0) + log.reps);
  }
  return [...totals.entries()].map(([name, reps]) => `${name}:${reps}`).join(", ");
}

function estimateActivityMetrics(name: ActivityName, reps: number): ActivityEstimate {
  // Heuristic estimates for quick user-logged entries.
  const perRepSeconds: Record<ActivityName, number> = {
    Squat: 2.8,
    Pushup: 2.6,
    Lunge: 3.2,
    "Biceps Curl": 2.4,
    "Jumping Jack": 1.6,
    Plank: 3.0,
  };

  const perRepCalories: Record<ActivityName, number> = {
    Squat: 0.34,
    Pushup: 0.38,
    Lunge: 0.36,
    "Biceps Curl": 0.22,
    "Jumping Jack": 0.25,
    Plank: 0.15,
  };

  const durationMinutes = Number(((reps * perRepSeconds[name]) / 60).toFixed(1));
  const calories = Number((reps * perRepCalories[name]).toFixed(1));
  return { durationMinutes, calories };
}

function sanitizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function findClosestFoodName(text: string): string | null {
  const normalized = text.toLowerCase();
  const keys = Object.keys(FOOD_MACRO_DB);

  for (const key of keys) {
    if (normalized.includes(key)) return key;
  }

  const words = normalized.split(/\s+/).map(sanitizeToken).filter((w) => w.length >= 3);
  let best: { key: string; score: number } | null = null;

  for (const key of keys) {
    const keyWords = key.split(" ").map(sanitizeToken).filter(Boolean);
    for (const kw of keyWords) {
      for (const w of words) {
        const d = levenshtein(w, kw);
        const threshold = kw.length <= 5 ? 1 : 2;
        if (d <= threshold && (!best || d < best.score)) {
          best = { key, score: d };
        }
      }
    }
  }

  return best?.key ?? null;
}

function parseFoodQuantity(input: string): { amount: number; unit: "g" | "piece" } {
  const lower = input.toLowerCase();
  const gramMatch = lower.match(/(\d{1,4})\s*(g|gm|grams?)/i);
  if (gramMatch) {
    return { amount: Number(gramMatch[1]), unit: "g" };
  }

  const pieceMatch = lower.match(/(\d{1,3})\s*(piece|pieces|egg|eggs|wing|wings)/i);
  if (pieceMatch) {
    return { amount: Number(pieceMatch[1]), unit: "piece" };
  }

  return { amount: 100, unit: "g" };
}

function scaleMacros(base: FoodMacro, quantity: { amount: number; unit: "g" | "piece" }): FoodMacro {
  const grams = quantity.unit === "g" ? quantity.amount : quantity.amount * 50;
  const factor = grams / 100;
  return {
    calories: Number((base.calories * factor).toFixed(1)),
    protein: Number((base.protein * factor).toFixed(1)),
    carbs: Number((base.carbs * factor).toFixed(1)),
    fats: Number((base.fats * factor).toFixed(1)),
  };
}

function parseFoodLogIntent(input: string): { foodKey: string; quantity: { amount: number; unit: "g" | "piece" } } | null {
  const lower = input.toLowerCase();
  const isFoodLogIntent = /\b(i ate|i had|log food|add food|logged food|track food|consumed)\b/i.test(lower);
  if (!isFoodLogIntent) return null;

  const foodKey = findClosestFoodName(lower);
  if (!foodKey) return null;

  return { foodKey, quantity: parseFoodQuantity(lower) };
}

function parseFoodMacroQuestion(input: string): { foodKey: string; quantity: { amount: number; unit: "g" | "piece" } } | null {
  const lower = input.toLowerCase();
  const isMacroQuestion = /\b(protein|carb|carbs|fat|fats|macro|macros|calorie|calories|nutrition)\b/i.test(lower);
  if (!isMacroQuestion) return null;

  const foodKey = findClosestFoodName(lower);
  if (!foodKey) return null;

  return { foodKey, quantity: parseFoodQuantity(lower) };
}

function getProteinSuggestions(totalProteinConsumed: number, proteinGoal: number): string {
  const remaining = proteinGoal - totalProteinConsumed;

  if (remaining <= 0) {
    return `Protein target hit! You've consumed ${totalProteinConsumed.toFixed(1)}g of your ${proteinGoal}g goal today. 🎉 Focus on hydration and recovery now!`;
  }

  const sorted = Object.entries(FOOD_MACRO_DB)
    .filter(([, m]) => m.protein > 10)
    .sort(([, a], [, b]) => b.protein - a.protein)
    .slice(0, 3);

  const suggestions = sorted.map(([name, macro]) => {
    const gNeeded = Math.ceil((remaining / macro.protein) * 100);
    return `- **${name}**: ~${gNeeded}g → ~${remaining.toFixed(0)}g protein (${Math.round((gNeeded * macro.calories) / 100)} kcal)`;
  });

  return [
    `Protein tracker: ${totalProteinConsumed.toFixed(1)}g consumed / ${proteinGoal}g goal — **${remaining.toFixed(1)}g still needed.**`,
    "Top foods to close the gap:",
    ...suggestions,
    "Log your next meal and I'll keep tracking! 🥗",
  ].join("\n");
}

function getDashboardCoachAdvice(params: {
  workouts: WorkoutEntry[];
  foods: NutritionEntry[];
  goals: GoalEntry | null;
}): string {
  const { workouts, foods, goals } = params;
  const totalWorkoutReps = workouts.reduce((sum, w) => sum + (w.reps || 0), 0);
  const totalWorkoutCals = workouts.reduce((sum, w) => sum + (w.calories_burned || 0), 0);
  const totalProtein = foods.reduce((sum, n) => sum + (n.protein_g || 0), 0);
  const totalCarbs = foods.reduce((sum, n) => sum + (n.carbs_g || 0), 0);
  const totalFats = foods.reduce((sum, n) => sum + (n.fats_g || 0), 0);
  const totalFoodCalories = foods.reduce((sum, n) => sum + (n.calories || 0), 0);

  const dailyCaloriesGoal = goals?.daily_calories ?? 2200;
  const proteinGoal = goals?.protein_target_g ?? 150;
  const carbsGoal = goals?.carbs_target_g ?? 250;
  const fatsGoal = goals?.fats_target_g ?? 65;

  const proteinGap = Math.max(0, proteinGoal - totalProtein);
  const calorieGap = dailyCaloriesGoal - totalFoodCalories;

  const lines = [
    "Dashboard Coach Analysis:",
    `- Workouts logged: ${workouts.length} sessions, ${totalWorkoutReps} reps, ${totalWorkoutCals.toFixed(1)} kcal burned`,
    `- Nutrition logged: ${foods.length} foods, ${totalFoodCalories.toFixed(1)} kcal, P ${totalProtein.toFixed(1)}g / C ${totalCarbs.toFixed(1)}g / F ${totalFats.toFixed(1)}g`,
    `- Goals: ${dailyCaloriesGoal} kcal, P ${proteinGoal}g / C ${carbsGoal}g / F ${fatsGoal}g`,
  ];

  if (proteinGap > 0) {
    lines.push(`- Action: add about ${proteinGap.toFixed(1)}g protein today (examples: chicken breast, eggs, yogurt).`);
  } else {
    lines.push("- Action: protein target met. Keep meal timing consistent and hydrate well.");
  }

  if (calorieGap > 300) {
    lines.push("- Action: calorie intake looks low vs goal. Add one balanced meal/snack.");
  } else if (calorieGap < -300) {
    lines.push("- Action: calorie intake is above goal. Reduce high-fat snacks and sugary drinks next meal.");
  } else {
    lines.push("- Action: calories are near target. Maintain current consistency.");
  }

  if (workouts.length < 3) {
    lines.push("- Training tip: target at least 3 workout sessions this week for better progress.");
  } else {
    lines.push("- Training tip: good workout consistency. Progressively add reps or resistance.");
  }

  return lines.join("\n");
}

function createWorkoutPlanFromPrompt(input: string): string {
  const lower = input.toLowerCase();
  const goal = /weight loss|fat loss|lose/i.test(lower)
    ? "weight loss"
    : /muscle|bulk|gain/i.test(lower)
      ? "muscle gain"
      : "general fitness";

  const level = /beginner/i.test(lower)
    ? "beginner"
    : /advanced/i.test(lower)
      ? "advanced"
      : "intermediate";

  const dayMatch = lower.match(/(\d)\s*(day|days)/i);
  const days = dayMatch ? Math.min(6, Math.max(3, Number(dayMatch[1]))) : 4;

  const templates: Record<string, string[]> = {
    "weight loss": [
      "Lower body + brisk cardio finish",
      "Upper body push + core",
      "HIIT conditioning + mobility",
      "Upper body pull + steady cardio",
      "Full body circuit",
      "Active recovery walk + stretching",
    ],
    "muscle gain": [
      "Push day (chest/shoulders/triceps)",
      "Pull day (back/biceps)",
      "Leg day (squat focus)",
      "Upper hypertrophy + core",
      "Lower hypertrophy + glutes",
      "Optional weak-point accessories",
    ],
    "general fitness": [
      "Full body strength",
      "Cardio + core",
      "Upper body strength",
      "Lower body strength + mobility",
      "Conditioning circuit",
      "Recovery walk + stretch",
    ],
  };

  const selected = templates[goal];
  const daysPlan = Array.from({ length: days }, (_, i) => `Day ${i + 1}: ${selected[i]}`);

  return [
    `Coach Plan (${level}, ${goal}, ${days} days/week):`,
    ...daysPlan,
    "Nutrition focus: prioritize protein in every meal and keep hydration high.",
    "Progression rule: increase total reps by 5-10% per week if form remains strong.",
  ].join("\n");
}

function createTimedGoalPlan(input: string): string {
  const lower = input.toLowerCase();
  const daysMatch = lower.match(/(\d{1,3})\s*(day|days)/i);
  const totalDays = daysMatch ? Math.min(365, Math.max(7, Number(daysMatch[1]))) : 60;
  const weeks = Math.round(totalDays / 7);

  const isLean = /lean|cut|shred|lose|fat loss|slim|weight loss|burn fat/i.test(lower);
  const isMuscle = /muscle|bulk|gain|strong|bigger|build/i.test(lower);

  if (isLean) {
    return [
      `**${totalDays}-Day Get Lean Plan 🔥**`,
      "",
      "**Weekly Training (4–5 days):**",
      "- Mon: HIIT cardio + core — 30 min",
      "- Tue: Lower body (Squats + Lunges) — 4 × 15 reps",
      "- Wed: Rest or 20-min walk",
      "- Thu: Upper body (Pushups + Curls) — 4 × 12 reps",
      "- Fri: Full body circuit + Jumping Jacks — 3 rounds",
      "- Sat: Brisk walk or jog — 30–40 min",
      "- Sun: Complete rest + stretching",
      "",
      "**Calorie & Nutrition Strategy:**",
      "- Eat at 300–500 kcal deficit daily",
      "- Protein: 1.6–2g per kg of body weight per day",
      "- Cut processed snacks, sugar, and liquid calories",
      "- Drink 2.5–3L water daily",
      "",
      `**Estimated Results in ${totalDays} Days:**`,
      `- Fat loss: ~${(weeks * 0.3).toFixed(1)}–${(weeks * 0.5).toFixed(1)} kg`,
      `- Total workout sessions: ~${Math.floor(weeks * 4.5)}`,
      "",
      "Track every meal in Nutrition Tracker and every session in Workout Tracker. I'll coach you every step of the way! 💪",
    ].join("\n");
  }

  if (isMuscle) {
    return [
      `**${totalDays}-Day Muscle Building Plan 💪**`,
      "",
      "**Weekly Training (4 days):**",
      "- Mon: Push day — Pushups, shoulder press (4 × 10–12)",
      "- Tue: Pull day — Curls, rows (4 × 10–12)",
      "- Thu: Leg day — Squats, Lunges (4 × 12)",
      "- Sat: Full body compound + core",
      "",
      "**Nutrition Strategy:**",
      "- Eat at 200–300 kcal surplus daily",
      "- Protein: 1.8–2.2g per kg of body weight",
      "- Complex carbs (rice, oats) before and after workouts",
      "",
      `**Estimated Results in ${totalDays} Days:**`,
      `- Lean muscle gain: ~${(weeks * 0.08).toFixed(1)}–${(weeks * 0.15).toFixed(1)} kg`,
      "- Progressive overload: add 5–10% volume each week",
      "",
      "Stay consistent, log everything, and I'm here to keep you on track! 🏋️",
    ].join("\n");
  }

  return [
    `**${totalDays}-Day General Fitness Plan 🌟**`,
    "",
    "**Weekly Training (3–4 days):**",
    "- Day 1: Full body strength (Squats, Pushups, Curls — 3 × 12)",
    "- Day 2: Cardio + core (20 min + Plank holds)",
    "- Day 3: Rest or yoga/stretching",
    "- Day 4: Lower body + Jumping Jacks conditioning",
    "",
    "**Daily Non-Negotiables:**",
    "- Sleep 7–8 hours every night",
    "- Drink 2–3L water daily",
    "- Log meals to stay within calorie goal",
    "",
    `Over ${weeks} weeks you'll build strength, endurance, and bulletproof habits. Start today — your future self is counting on you! 🚀`,
  ].join("\n");
}

function buildApiMessages(history: Message[], latestInput: string, activitySummary: string): ApiMessage[] {
  const recent = history.slice(-8).map((m) => ({ role: m.role, content: m.content } as ApiMessage));
  return [
    {
      role: "system",
      content:
        `You are Coach AI, an energetic and motivating fitness coach for a workout web app. You inspire and encourage users, track their progress, suggest foods to reach protein goals, and build personalized time-bound plans (e.g. 'get lean in 60 days'). If user asks about a page/screen/tab, explain that page specifically. If user asks a fitness question, answer directly and add a motivating line.\nKnown activity summary: ${activitySummary}`,
    },
    ...recent,
    { role: "user", content: latestInput },
  ];
}

async function getAIResponse(input: string, history: Message[], activitySummary: string): Promise<string> {
  if (!CHATBOT_API_KEY) {
    return getResponse(input);
  }

  try {
    const response = await fetch(CHATBOT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHATBOT_API_KEY}`,
      },
      body: JSON.stringify({
        model: CHATBOT_MODEL,
        temperature: 0.5,
        messages: buildApiMessages(history, input, activitySummary),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chatbot API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }

    return "I can help with workouts, form tips, nutrition, and app guidance. Ask me anything fitness-related.";
  } catch {
    return getResponse(input);
  }
}

export function FloatingChatbot() {
  const { user } = useAuth();
  const { data: workouts } = useFirestoreCollection<WorkoutEntry>("workouts");
  const { data: foods } = useFirestoreCollection<NutritionEntry>("nutrition");
  const { data: goalsData } = useGoals();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hey! 💪 I'm Coach AI, your virtual fitness assistant. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const raw = input.trim();
    if (!raw || sending) return;

    const userMsg: Message = { role: "user", content: raw };
    const historySnapshot = [...messages, userMsg];
    setMessages(historySnapshot);
    setInput("");
    setSending(true);

    const wantsSummary = /\b(show|what|summary|track|tracked|history|today)\b/i.test(raw) && /\b(activity|activities|workout|reps|progress)\b/i.test(raw);
    const wantsReset = /\b(reset|clear|delete)\b/i.test(raw) && /\b(activity|activities|history|progress)\b/i.test(raw);
    const wantsDashboardAnalysis = /\b(analyze|analysis|review|check|how am i doing|what should i do)\b/i.test(raw) && /\b(dashboard|progress|goal|goals)\b/i.test(raw);
    const wantsPlan = /\b(create|make|build|generate)\b/i.test(raw) && /\b(plan|workout plan|training plan)\b/i.test(raw);
    const wantsMotivation = /\b(motivate|motivation|motivating|inspire|inspiration|encourage|keep going|give up|lazy|no energy|tired|demotivated|struggling)\b/i.test(raw);
    const wantsProteinSuggestion =
      /\b(protein.*left|protein.*remaining|how much protein|complete.*protein|reach.*protein|protein.*goal|protein.*target|how.*more protein)\b/i.test(raw) ||
      (/\b(what should i eat|suggest.*food|next meal|food.*suggest|food.*recommend)\b/i.test(raw) && /\b(protein|goal|target)\b/i.test(raw));
    const wantsTimedGoalPlan =
      /\b(\d{1,3})\s*(day|days)\b/i.test(raw) &&
      /\b(lean|shred|lose|fat|burn|get fit|build|muscle|fitness|plan|goal|achieve|slim|cut)\b/i.test(raw);
    const detectedActivity = parseActivityInput(raw);
    const detectedFoodLog = parseFoodLogIntent(raw);
    const foodMacroQuestion = parseFoodMacroQuestion(raw);

    if (wantsReset) {
      writeStoredActivities([]);
      try {
        localStorage.removeItem(FOOD_STORAGE_KEY);
      } catch {
        // ignore
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Activity and food history cleared. Start with: `I did 20 squats` or `I ate 200g chicken breast`." },
      ]);
      setSending(false);
      return;
    }

    if (detectedFoodLog) {
      const macroBase = FOOD_MACRO_DB[detectedFoodLog.foodKey];
      const scaled = scaleMacros(macroBase, detectedFoodLog.quantity);

      if (user) {
        try {
          await addFirestoreDoc("nutrition", user.uid, {
            food_name: detectedFoodLog.foodKey,
            calories: scaled.calories,
            protein_g: scaled.protein,
            carbs_g: scaled.carbs,
            fats_g: scaled.fats,
            meal_type: "logged",
            date: serverTimestamp(),
          });
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "I estimated your food macros but could not sync to Nutrition Tracker. Please try again.",
            },
          ]);
          setSending(false);
          return;
        }
      }

      const goalsRef = (goalsData[0] as GoalEntry | undefined) ?? null;
      const proteinGoalForFood = goalsRef?.protein_target_g ?? 150;
      const proteinConsumedSoFar = foods.reduce((sum, f) => sum + (f.protein_g || 0), 0) + scaled.protein;
      const proteinTip = getProteinSuggestions(proteinConsumedSoFar, proteinGoalForFood);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            `Logged food: **${detectedFoodLog.foodKey}** (${detectedFoodLog.quantity.amount}${detectedFoodLog.quantity.unit === "g" ? "g" : " pcs"}).\n` +
            `Estimated macros: ${scaled.calories} kcal | P ${scaled.protein}g | C ${scaled.carbs}g | F ${scaled.fats}g\n` +
            "Saved to Nutrition Tracker. ✅\n\n" +
            proteinTip,
        },
      ]);
      setSending(false);
      return;
    }

    if (foodMacroQuestion) {
      const macroBase = FOOD_MACRO_DB[foodMacroQuestion.foodKey];
      const scaled = scaleMacros(macroBase, foodMacroQuestion.quantity);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            `${foodMacroQuestion.foodKey} (${foodMacroQuestion.quantity.amount}${foodMacroQuestion.quantity.unit === "g" ? "g" : " pcs"}) estimate:\n` +
            `Calories: ${scaled.calories} kcal\nProtein: ${scaled.protein}g\nCarbs: ${scaled.carbs}g\nFats: ${scaled.fats}g\n` +
            "Say `I ate ...` to log this directly in Nutrition Tracker.",
        },
      ]);
      setSending(false);
      return;
    }

    if (detectedActivity) {
      const updatedLogs = addActivityLog(detectedActivity);
      const totalForExercise = updatedLogs
        .filter((x) => x.name === detectedActivity.name)
        .reduce((sum, x) => sum + x.reps, 0);
      const estimate = estimateActivityMetrics(detectedActivity.name, detectedActivity.reps);

      if (user) {
        try {
          await addFirestoreDoc("workouts", user.uid, {
            exercise_name: detectedActivity.name,
            sets: 1,
            reps: detectedActivity.reps,
            duration_minutes: estimate.durationMinutes,
            calories_burned: estimate.calories,
            workout_type: "user logged",
            ai_detected: true,
            timestamp: serverTimestamp(),
          });
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "I tracked your reps in chat, but could not sync to Workout Tracker right now. Please try again.",
            },
          ]);
          setSending(false);
          return;
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            `Logged: **${detectedActivity.reps} ${detectedActivity.name}** reps. ✅\n` +
            `Total ${detectedActivity.name} today: ${totalForExercise} reps.\n` +
            `Estimated duration: ${estimate.durationMinutes} min | Calories burned: ${estimate.calories} kcal\n` +
            "Saved to Workout Tracker.\n\n" +
            getMotivationalQuote(totalForExercise),
        },
      ]);
      setSending(false);
      return;
    }

    if (wantsSummary) {
      const logs = readStoredActivities();
      setMessages((prev) => [...prev, { role: "assistant", content: summarizeActivities(logs) }]);
      setSending(false);
      return;
    }

    if (wantsMotivation) {
      const quote = getMotivationalQuote();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            `${quote}\n\n` +
            "You're here, you're moving, and that already puts you ahead of most people. " +
            "Log a workout or a meal and let's build on that momentum together! 🏆",
        },
      ]);
      setSending(false);
      return;
    }

    if (wantsProteinSuggestion) {
      const goals = (goalsData[0] as GoalEntry | undefined) ?? null;
      const proteinGoal = goals?.protein_target_g ?? 150;
      const totalProtein = foods.reduce((sum, f) => sum + (f.protein_g || 0), 0);
      const reply = getProteinSuggestions(totalProtein, proteinGoal);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setSending(false);
      return;
    }

    if (wantsTimedGoalPlan) {
      const plan = createTimedGoalPlan(raw);
      setMessages((prev) => [...prev, { role: "assistant", content: plan }]);
      setSending(false);
      return;
    }

    if (wantsDashboardAnalysis) {
      const goals = goalsData[0] ?? null;
      const review = getDashboardCoachAdvice({ workouts, foods, goals });
      setMessages((prev) => [...prev, { role: "assistant", content: review }]);
      setSending(false);
      return;
    }

    if (wantsPlan) {
      const plan = createWorkoutPlanFromPrompt(raw);
      setMessages((prev) => [...prev, { role: "assistant", content: plan }]);
      setSending(false);
      return;
    }

    const activitySummary = getActivitySummaryForPrompt(readStoredActivities());
    const reply = await getAIResponse(raw, historySnapshot, activitySummary);
    setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    setSending(false);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-20 right-6 z-50 w-[min(92vw,560px)] h-[92vh] max-h-[92vh] rounded-2xl border bg-card shadow-elevated flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-primary p-4 flex items-center gap-3">
              <img src={trainerAvatar} alt="Coach" className="h-10 w-10 rounded-full object-cover border-2 border-primary-foreground/30" />
              <div className="flex-1">
                <p className="font-display font-semibold text-primary-foreground text-sm">Coach AI</p>
                <p className="text-primary-foreground/70 text-xs">Your fitness assistant</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-primary-foreground/70 hover:text-primary-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`px-3 py-2 rounded-xl text-sm max-w-[78%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-secondary text-secondary-foreground rounded-bl-sm"
                    }`}
                  >
                    {msg.content.split("\n").map((line, j) => (
                      <span key={j}>
                        {line.split(/(\*\*.*?\*\*)/).map((part, k) =>
                          part.startsWith("**") && part.endsWith("**") ? (
                            <strong key={k}>{part.slice(2, -2)}</strong>
                          ) : (
                            part
                          )
                        )}
                        {j < msg.content.split("\n").length - 1 && <br />}
                      </span>
                    ))}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-7 w-7 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="h-4 w-4 text-accent" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="p-3 border-t">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void send()}
                  placeholder="Ask about fitness..."
                  className="flex-1 bg-secondary text-foreground rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
                <Button size="icon" onClick={() => void send()} className="bg-gradient-primary shrink-0" disabled={sending}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-primary shadow-elevated flex items-center justify-center text-primary-foreground animate-pulse-glow"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </motion.button>
    </>
  );
}
