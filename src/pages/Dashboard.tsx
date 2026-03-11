import { useMemo } from "react";
import { motion } from "framer-motion";
import { Flame, Dumbbell, Target, Zap, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { useFirestoreCollection, useGoals, useBodyMetrics } from "@/hooks/useFirestore";

type TimestampLike = { toDate: () => Date };
type DateLike = TimestampLike | Date | null | undefined;

interface WorkoutEntry {
  id: string;
  calories_burned: number;
  timestamp?: DateLike;
}

interface NutritionEntry {
  id: string;
  protein_g: number;
  date?: DateLike;
}

interface GoalEntry {
  daily_calories?: number;
  protein_target_g?: number;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isSameDay(ts: DateLike, ref: Date): boolean {
  const d: Date | null = ts?.toDate?.() ?? (ts instanceof Date ? ts : null);
  if (!d) return false;
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

export default function Dashboard() {
  const { data: workouts } = useFirestoreCollection<WorkoutEntry>("workouts");
  const { data: foods } = useFirestoreCollection<NutritionEntry>("nutrition");
  const { data: goalsData } = useGoals();
  const { data: metricsData } = useBodyMetrics();

  const today = useMemo(() => new Date(), []);
  const goal = (goalsData[0] as GoalEntry | undefined) ?? {};
  const caloriesGoal = goal.daily_calories ?? 2200;
  const proteinGoal = goal.protein_target_g ?? 150;

  const todayCaloriesBurned = useMemo(
    () => workouts.filter(w => isSameDay(w.timestamp, today)).reduce((s, w) => s + (w.calories_burned || 0), 0),
    [workouts, today]
  );

  const thisWeekWorkouts = useMemo(() => {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return workouts.filter(w => {
      const d: Date | null = w.timestamp?.toDate?.() ?? null;
      return d !== null && d >= weekStart;
    }).length;
  }, [workouts, today]);

  const todayProtein = useMemo(
    () => foods.filter(f => isSameDay(f.date, today)).reduce((s, f) => s + (f.protein_g || 0), 0),
    [foods, today]
  );

  const workoutStreak = useMemo(() => {
    if (workouts.length === 0) return 0;
    const dateSet = new Set<string>();
    for (const w of workouts) {
      const d: Date | null = w.timestamp?.toDate?.() ?? null;
      if (d) dateSet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const check = new Date(today);
      check.setDate(today.getDate() - i);
      const key = `${check.getFullYear()}-${check.getMonth()}-${check.getDate()}`;
      if (dateSet.has(key)) {
        streak++;
      } else if (i > 1) {
        break;
      }
    }
    return streak;
  }, [workouts, today]);

  const weeklyChartData = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      const dayWorkouts = workouts.filter(w => isSameDay(w.timestamp, d));
      return {
        day: DAY_LABELS[d.getDay()],
        workouts: dayWorkouts.length,
        calories: dayWorkouts.reduce((s, w) => s + (w.calories_burned || 0), 0),
      };
    }),
    [workouts, today]
  );

  const weightProgress = useMemo(() => {
    const sorted = [...metricsData]
      .filter(m => m.weight_kg)
      .sort((a, b) => {
        const da = a.recorded_at?.toDate?.()?.getTime() ?? 0;
        const db = b.recorded_at?.toDate?.()?.getTime() ?? 0;
        return da - db;
      })
      .slice(-8);
    if (sorted.length === 0) return null;
    return sorted.map((m, i) => ({
      week: m.recorded_at?.toDate?.()?.toLocaleDateString?.("en-US", { month: "short", day: "numeric" }) ?? `Entry ${i + 1}`,
      weight: Number(m.weight_kg),
    }));
  }, [metricsData]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Your fitness overview for today</p>
      </div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        <StatCard
          title="Calories Burned Today"
          value={todayCaloriesBurned > 0 ? todayCaloriesBurned.toLocaleString() : "0"}
          icon={Flame}
          variant="accent"
          subtitle={`Goal: ${caloriesGoal.toLocaleString()} kcal`}
        />
        <StatCard
          title="Workouts Done"
          value={String(thisWeekWorkouts)}
          icon={Dumbbell}
          variant="primary"
          subtitle="This week"
        />
        <StatCard
          title="Protein Intake"
          value={`${Math.round(todayProtein)}g`}
          icon={Target}
          subtitle={`Goal: ${proteinGoal}g`}
        />
        <StatCard
          title="Workout Streak"
          value={workoutStreak > 0 ? `${workoutStreak} day${workoutStreak === 1 ? "" : "s"}` : "0 days"}
          icon={Zap}
          variant="accent"
        />
      </motion.div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-2xl border p-6 shadow-card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display font-semibold text-lg">Weekly Calories Burned</h3>
              <p className="text-sm text-muted-foreground">Last 7 days</p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center">
              <Flame className="h-5 w-5 text-accent" />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={weeklyChartData}>
              <defs>
                <linearGradient id="caloriesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.875rem" }} />
              <Area type="monotone" dataKey="calories" stroke="hsl(var(--chart-3))" strokeWidth={2} fill="url(#caloriesGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-2xl border p-6 shadow-card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display font-semibold text-lg">Workouts This Week</h3>
              <p className="text-sm text-muted-foreground">Sessions per day</p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Dumbbell className="h-5 w-5 text-primary" />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weeklyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.875rem" }} />
              <Bar dataKey="workouts" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Weight Progress */}
      {weightProgress ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-2xl border p-6 shadow-card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display font-semibold text-lg">Weight Progress</h3>
              <p className="text-sm text-muted-foreground">From body metrics log</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                <TrendingUp className="h-4 w-4" />
                {weightProgress.length > 1
                  ? `${(weightProgress[weightProgress.length - 1].weight - weightProgress[0].weight).toFixed(1)} kg`
                  : "Tracking"}
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={weightProgress}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={["dataMin - 2", "dataMax + 2"]} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.875rem" }} />
              <Line type="monotone" dataKey="weight" stroke="hsl(var(--chart-1))" strokeWidth={3} dot={{ fill: "hsl(var(--chart-1))", strokeWidth: 2, r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-2xl border p-8 shadow-card text-center">
          <TrendingUp className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="font-medium text-muted-foreground">No weight data yet</p>
          <p className="text-sm text-muted-foreground mt-1">Log your body metrics in the Health page to see your weight trend here.</p>
        </motion.div>
      )}
    </div>
  );
}
