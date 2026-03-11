import { motion } from "framer-motion";
import { TrendingDown, TrendingUp, BarChart3, Calendar, Flame, Dumbbell } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { useMemo } from "react";
import { useFirestoreCollection, useBodyMetrics } from "@/hooks/useFirestore";

type TimestampLike = { toDate: () => Date };
type DateLike = TimestampLike | Date | null | undefined;

interface WorkoutEntry { id: string; calories_burned?: number; timestamp?: DateLike; }
interface NutritionEntry { id: string; calories?: number; date?: DateLike; }
interface AISession { id: string; posture_score?: number; reps_detected?: number; calories_estimated?: number; exercise_name?: string; recorded_at?: DateLike; }

function toDate(ts: DateLike): Date | null {
  if (!ts) return null;
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}

function isoWeekKey(d: Date): string {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `W${weekNum}`;
}

export default function ProgressAnalytics() {
  const { data: workouts } = useFirestoreCollection<WorkoutEntry>("workouts");
  const { data: foods } = useFirestoreCollection<NutritionEntry>("nutrition");
  const { data: metricsRaw } = useBodyMetrics();
  const { data: aiSessions } = useFirestoreCollection<AISession>("ai_workout_analysis", "recorded_at");

  // Weight change timeline from body_metrics (oldest → newest)
  const weightTimeline = useMemo(() => {
    const sorted = [...metricsRaw]
      .filter(m => m.weight_kg)
      .sort((a, b) => (toDate(a.recorded_at)?.getTime() ?? 0) - (toDate(b.recorded_at)?.getTime() ?? 0));
    return sorted.map(m => ({
      date: toDate(m.recorded_at)?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) ?? "—",
      weight: Number(m.weight_kg),
    }));
  }, [metricsRaw]);

  // Weekly calories burned (workouts) vs consumed (nutrition) — last 8 weeks
  const weeklyCalories = useMemo(() => {
    const map: Record<string, { burned: number; consumed: number; ts: number }> = {};
    for (const w of workouts) {
      const d = toDate(w.timestamp);
      if (!d) continue;
      const k = isoWeekKey(d);
      map[k] = map[k] ?? { burned: 0, consumed: 0, ts: d.getTime() };
      map[k].burned += w.calories_burned ?? 0;
    }
    for (const f of foods) {
      const d = toDate(f.date);
      if (!d) continue;
      const k = isoWeekKey(d);
      map[k] = map[k] ?? { burned: 0, consumed: 0, ts: d.getTime() };
      map[k].consumed += f.calories ?? 0;
    }
    return Object.entries(map)
      .sort((a, b) => a[1].ts - b[1].ts)
      .slice(-8)
      .map(([week, v]) => ({ week, burned: Math.round(v.burned), consumed: Math.round(v.consumed) }));
  }, [workouts, foods]);

  // Workout frequency by ISO week — last 8 weeks
  const workoutFrequency = useMemo(() => {
    const map: Record<string, { sessions: number; ts: number }> = {};
    for (const w of workouts) {
      const d = toDate(w.timestamp);
      if (!d) continue;
      const k = isoWeekKey(d);
      map[k] = map[k] ?? { sessions: 0, ts: d.getTime() };
      map[k].sessions += 1;
    }
    return Object.entries(map)
      .sort((a, b) => a[1].ts - b[1].ts)
      .slice(-8)
      .map(([week, v]) => ({ week, sessions: v.sessions }));
  }, [workouts]);

  // Body transformation from body_metrics (oldest → newest)
  const bodyTransform = useMemo(() => {
    const sorted = [...metricsRaw]
      .filter(m => m.body_fat_percentage || m.muscle_mass_kg)
      .sort((a, b) => (toDate(a.recorded_at)?.getTime() ?? 0) - (toDate(b.recorded_at)?.getTime() ?? 0));
    return sorted.map(m => ({
      month: toDate(m.recorded_at)?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) ?? "—",
      bodyFat: Number(m.body_fat_percentage ?? 0),
      muscleMass: Number(m.muscle_mass_kg ?? 0),
    }));
  }, [metricsRaw]);

  // Summary stats computed from real data
  const totalWeightChange = useMemo(() => {
    if (weightTimeline.length < 2) return null;
    return (weightTimeline[weightTimeline.length - 1].weight - weightTimeline[0].weight).toFixed(1);
  }, [weightTimeline]);

  const avgWeeklyBurned = useMemo(() => {
    if (weeklyCalories.length === 0) return 0;
    return Math.round(weeklyCalories.reduce((s, w) => s + w.burned, 0) / weeklyCalories.length);
  }, [weeklyCalories]);

  const avgWorkoutsPerWeek = useMemo(() => {
    if (workoutFrequency.length === 0) return 0;
    return (workoutFrequency.reduce((s, w) => s + w.sessions, 0) / workoutFrequency.length).toFixed(1);
  }, [workoutFrequency]);

  const avgPostureScore = useMemo(() => {
    if (aiSessions.length === 0) return null;
    return Math.round(aiSessions.reduce((s, a) => s + (a.posture_score ?? 0), 0) / aiSessions.length);
  }, [aiSessions]);

  const summaryStats = useMemo(() => [
    {
      label: totalWeightChange !== null ? (Number(totalWeightChange) <= 0 ? "Total Weight Lost" : "Total Weight Gained") : "Weight Change",
      value: totalWeightChange !== null ? `${Math.abs(Number(totalWeightChange))} kg` : "--",
      icon: Number(totalWeightChange ?? 0) <= 0 ? TrendingDown : TrendingUp,
      trend: weightTimeline.length < 2 ? "Log body metrics to track" : `${weightTimeline[0].weight} → ${weightTimeline[weightTimeline.length - 1].weight} kg`,
      color: "primary",
    },
    {
      label: "Avg Weekly Calories Burned",
      value: avgWeeklyBurned > 0 ? avgWeeklyBurned.toLocaleString() : "--",
      icon: Flame,
      trend: weeklyCalories.length > 0 ? `Over ${weeklyCalories.length} week${weeklyCalories.length === 1 ? "" : "s"}` : "No workouts logged yet",
      color: "accent",
    },
    {
      label: "Avg Workouts / Week",
      value: Number(avgWorkoutsPerWeek) > 0 ? String(avgWorkoutsPerWeek) : "--",
      icon: Dumbbell,
      trend: workoutFrequency.length > 0 ? `${workouts.length} total sessions` : "No sessions yet",
      color: "primary",
    },
    {
      label: "Avg AI Posture Score",
      value: avgPostureScore !== null ? `${avgPostureScore}%` : "--",
      icon: BarChart3,
      trend: aiSessions.length > 0 ? `From ${aiSessions.length} AI session${aiSessions.length === 1 ? "" : "s"}` : "Use AI Trainer to track",
      color: "accent",
    },
  ], [totalWeightChange, avgWeeklyBurned, avgWorkoutsPerWeek, avgPostureScore, weightTimeline, weeklyCalories, workoutFrequency, workouts, aiSessions]);

  const hasWeightData = weightTimeline.length >= 2;
  const hasCaloriesData = weeklyCalories.length > 0;
  const hasFreqData = workoutFrequency.length > 0;
  const hasBodyData = bodyTransform.length >= 2;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Progress Analytics</h1>
        <p className="text-muted-foreground">Advanced insights into your fitness transformation</p>
      </div>

      {/* Summary Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {summaryStats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-card rounded-xl border p-5 shadow-card"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${s.color === "primary" ? "bg-primary/10" : "bg-accent/10"}`}>
                <s.icon className={`h-5 w-5 ${s.color === "primary" ? "text-primary" : "text-accent"}`} />
              </div>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </div>
            <p className="text-2xl font-display font-bold">{s.value}</p>
            <p className="text-xs text-primary mt-1">{s.trend}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Weight Change */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-2xl border p-6 shadow-card">
          <h3 className="font-display font-semibold text-lg mb-1">Weight Change Timeline</h3>
          <p className="text-sm text-muted-foreground mb-6">Your weight journey</p>
          {hasWeightData ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={weightTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={["dataMin - 2", "dataMax + 2"]} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.875rem" }} />
                <Line type="monotone" dataKey="weight" stroke="hsl(var(--chart-1))" strokeWidth={3} dot={{ fill: "hsl(var(--chart-1))", r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Log body metrics to see your weight trend.</div>
          )}
        </motion.div>

        {/* Calories Burned vs Consumed */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-2xl border p-6 shadow-card">
          <h3 className="font-display font-semibold text-lg mb-1">Calories: Burned vs Consumed</h3>
          <p className="text-sm text-muted-foreground mb-6">Weekly comparison</p>
          {hasCaloriesData ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={weeklyCalories}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.875rem" }} />
                <Bar dataKey="burned" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Burned" />
                <Bar dataKey="consumed" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} name="Consumed" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Log workouts and nutrition to see calorie comparison.</div>
          )}
        </motion.div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Workout Frequency */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-card rounded-2xl border p-6 shadow-card">
          <h3 className="font-display font-semibold text-lg mb-1">Workout Frequency</h3>
          <p className="text-sm text-muted-foreground mb-6">Sessions per week</p>
          {hasFreqData ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={workoutFrequency}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.875rem" }} />
                <Bar dataKey="sessions" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Log workouts to see your frequency trend.</div>
          )}
        </motion.div>

        {/* Body Transformation */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-card rounded-2xl border p-6 shadow-card">
          <h3 className="font-display font-semibold text-lg mb-1">Body Transformation</h3>
          <p className="text-sm text-muted-foreground mb-6">Body fat % vs muscle mass kg</p>
          {hasBodyData ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={bodyTransform}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.875rem" }} />
                <Line type="monotone" dataKey="bodyFat" stroke="hsl(var(--chart-3))" strokeWidth={2} name="Body Fat %" dot={{ fill: "hsl(var(--chart-3))", r: 4 }} />
                <Line type="monotone" dataKey="muscleMass" stroke="hsl(var(--chart-1))" strokeWidth={2} name="Muscle Mass (kg)" dot={{ fill: "hsl(var(--chart-1))", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Log body metrics with body fat % to see transformation.</div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
