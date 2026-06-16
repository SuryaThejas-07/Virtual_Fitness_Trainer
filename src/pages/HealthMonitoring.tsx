import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  HeartPulse, Scale, Percent, Dumbbell, Flame, Plus,
  TrendingDown, TrendingUp, BarChart3
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBodyMetrics, useUserProfile, useFirestoreCollection, addFirestoreDoc } from "@/hooks/useFirestore";
import { useAuth } from "@/contexts/AuthContext";
import { serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type TimestampLike = { toDate: () => Date };
type DateLike = TimestampLike | Date | null | undefined;

interface WorkoutEntry { id: string; calories_burned?: number; timestamp?: DateLike; }
interface NutritionEntry { id: string; calories?: number; date?: DateLike; }
interface AISession { id: string; posture_score?: number; reps_detected?: number; calories_estimated?: number; exercise_name?: string; recorded_at?: DateLike; }

function toDate(ts: DateLike): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "string") return new Date(ts);
  
  const obj = ts as Record<string, unknown>;
  if (obj && typeof obj.toDate === "function") {
    return (obj.toDate as () => Date)();
  }
  if (obj && typeof obj.seconds === "number") {
    return new Date(obj.seconds * 1000);
  }
  return null;
}


function isoWeekKey(d: Date): string {
  const startOfWeek = new Date(d);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday, etc.
  startOfWeek.setDate(d.getDate() - day);
  return startOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function HealthMonitoring() {
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();
  const { data: metrics, loading: metricsLoading } = useBodyMetrics();
  
  // Analytics collections
  const { data: workouts } = useFirestoreCollection<WorkoutEntry>("workouts");
  const { data: foods } = useFirestoreCollection<NutritionEntry>("nutrition");
  const { data: aiSessions } = useFirestoreCollection<AISession>("ai_workout_analysis", "recorded_at");

  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState({ weight_kg: "", body_fat_percentage: "", muscle_mass_kg: "" });

  // 1. Health metrics computations
  // metrics is already sorted newest-first by useFirestoreCollection
  const latest = metrics[0] || {};

  const handleLogMetrics = async () => {
    if (!logForm.weight_kg || !user) return;
    const w = parseFloat(logForm.weight_kg);
    const h = profile?.height_cm ? parseFloat(String(profile.height_cm)) : 0;
    const bmiVal = h ? Number((w / Math.pow(h / 100, 2)).toFixed(1)) : null;

    // 1. Add entry to body_metrics log
    await addFirestoreDoc("body_metrics", user.uid, {
      weight_kg: w,
      body_fat_percentage: logForm.body_fat_percentage ? parseFloat(logForm.body_fat_percentage) : null,
      muscle_mass_kg: logForm.muscle_mass_kg ? parseFloat(logForm.muscle_mass_kg) : null,
      bmi: bmiVal,
      recorded_at: serverTimestamp(),
    });

    // 2. Synchronize to main user profile document
    const ageVal = profile?.age ? Number(profile.age) : 0;
    const genderVal = profile?.gender ? String(profile.gender) : "";
    const activityLevelVal = profile?.activity_level ? String(profile.activity_level) : "";
    const isMale = genderVal.toLowerCase() === "male";

    const computedBmr = w && h && ageVal
      ? Math.round(
          isMale
            ? 10 * w + 6.25 * h - 5 * ageVal + 5
            : 10 * w + 6.25 * h - 5 * ageVal - 161
        )
      : null;

    const activityMultipliers: Record<string, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    };
    const computedTdee = computedBmr
      ? Math.round(computedBmr * (activityMultipliers[activityLevelVal.toLowerCase()] ?? 1.55))
      : null;

    const updateData: Record<string, unknown> = {
      weight_kg: w,
    };
    if (bmiVal !== null) updateData.bmi = bmiVal;
    if (computedBmr !== null) updateData.bmr = computedBmr;
    if (computedTdee !== null) updateData.tdee = computedTdee;

    try {
      await updateDoc(doc(db, "users", user.uid), updateData);
    } catch (err) {
      console.error("Failed to update user profile metrics:", err);
    }

    setLogForm({ weight_kg: "", body_fat_percentage: "", muscle_mass_kg: "" });
    setShowLogForm(false);
  };

  // Compute all metrics live from raw profile data so they always show
  const weight_kg = Number(latest.weight_kg || profile?.weight_kg || 0);
  const height_cm = Number(profile?.height_cm || 0);
  const age = Number(profile?.age || 0);
  const gender = String(profile?.gender || "");
  const activityLevel = String(profile?.activity_level || "");
  const isMale = gender.toLowerCase() === "male";

  const computedBmi =
    weight_kg && height_cm
      ? Number((weight_kg / Math.pow(height_cm / 100, 2)).toFixed(1))
      : null;

  const computedBmr =
    weight_kg && height_cm && age
      ? Math.round(
          isMale
            ? 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
            : 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
        )
      : null;

  const activityMultipliers: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };
  const computedTdee = computedBmr
    ? Math.round(computedBmr * (activityMultipliers[activityLevel.toLowerCase()] ?? 1.55))
    : null;

  // Deurenberg formula body fat estimate
  const computedBodyFat =
    computedBmi && age
      ? Number((1.2 * computedBmi + 0.23 * age - 10.8 * (isMale ? 1 : 0) - 5.4).toFixed(1))
      : null;

  // Lean muscle mass estimate
  const computedMuscleMass =
    weight_kg && computedBodyFat !== null
      ? Number((weight_kg * (1 - computedBodyFat / 100) * 0.85).toFixed(1))
      : null;

  const bmi = latest.bmi ?? computedBmi;
  const bodyFat = latest.body_fat_percentage ?? computedBodyFat;
  const muscleMass = latest.muscle_mass_kg ?? computedMuscleMass;
  const tdee = computedTdee ?? profile?.tdee;

  const healthMetrics = [
    {
      label: "BMI",
      value: bmi !== null ? String(bmi) : "--",
      status: bmi !== null
        ? (Number(bmi) < 18.5 ? "Underweight" : Number(bmi) < 25 ? "Normal" : Number(bmi) < 30 ? "Overweight" : "Obese")
        : "Enter profile data",
      icon: HeartPulse,
      color: "primary",
    },
    {
      label: "Weight",
      value: weight_kg ? `${weight_kg} kg` : "--",
      status: "Current",
      icon: Scale,
      color: "accent",
    },
    {
      label: "Body Fat",
      value: bodyFat !== null ? `${bodyFat}%` : "--",
      status: bodyFat !== null && latest.body_fat_percentage ? "Measured" : "Estimated",
      icon: Percent,
      color: "primary",
    },
    {
      label: "Muscle Mass",
      value: muscleMass !== null ? `${muscleMass} kg` : "--",
      status: muscleMass !== null && latest.muscle_mass_kg ? "Measured" : "Estimated",
      icon: Dumbbell,
      color: "accent",
    },
    {
      label: "Daily Calorie Need",
      value: tdee ? `${tdee} kcal` : "--",
      status: "Based on activity level",
      icon: Flame,
      color: "primary",
    },
  ];

  const bodyFatData = metrics.map((m) => {
    let fat = m.body_fat_percentage;
    if (!fat && m.weight_kg && height_cm && age) {
      const entryBmi = Number((m.weight_kg / Math.pow(height_cm / 100, 2)).toFixed(1));
      fat = Number((1.2 * entryBmi + 0.23 * age - 10.8 * (isMale ? 1 : 0) - 5.4).toFixed(1));
    }
    return {
      date: toDate(m.recorded_at)?.toLocaleDateString() || "—",
      fat: fat || 0,
    };
  }).reverse();

  const weightData = metrics.map((m) => ({
    date: toDate(m.recorded_at)?.toLocaleDateString() || "—",
    weight: m.weight_kg || 0,
  })).reverse();

  // 2. Analytics computations
  // Weight change timeline from body_metrics (oldest → newest)
  const weightTimeline = useMemo(() => {
    const sorted = [...metrics]
      .filter(m => m.weight_kg)
      .sort((a, b) => (toDate(a.recorded_at)?.getTime() ?? 0) - (toDate(b.recorded_at)?.getTime() ?? 0));
    return sorted.map(m => ({
      date: toDate(m.recorded_at)?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) ?? "—",
      weight: Number(m.weight_kg),
    }));
  }, [metrics]);

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
    const sorted = [...metrics]
      .filter(m => m.weight_kg)
      .sort((a, b) => (toDate(a.recorded_at)?.getTime() ?? 0) - (toDate(b.recorded_at)?.getTime() ?? 0));
    return sorted.map(m => {
      let fat = m.body_fat_percentage;
      if (!fat && m.weight_kg && height_cm && age) {
        const entryBmi = Number((m.weight_kg / Math.pow(height_cm / 100, 2)).toFixed(1));
        fat = Number((1.2 * entryBmi + 0.23 * age - 10.8 * (isMale ? 1 : 0) - 5.4).toFixed(1));
      }
      let muscle = m.muscle_mass_kg;
      if (!muscle && m.weight_kg && fat !== undefined && fat !== null) {
        muscle = Number((m.weight_kg * (1 - fat / 100) * 0.85).toFixed(1));
      }
      return {
        month: toDate(m.recorded_at)?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) ?? "—",
        bodyFat: Number(fat ?? 0),
        muscleMass: Number(muscle ?? 0),
      };
    });
  }, [metrics, height_cm, age, isMale]);

  const totalWeightChange = useMemo(() => {
    if (weightTimeline.length === 0) return null;
    if (weightTimeline.length === 1) return "0.0";
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
      label: totalWeightChange !== null ? (Number(totalWeightChange) < 0 ? "Total Weight Lost" : Number(totalWeightChange) > 0 ? "Total Weight Gained" : "Weight Change") : "Weight Change",
      value: totalWeightChange !== null ? `${Math.abs(Number(totalWeightChange)).toFixed(1)} kg` : "--",
      icon: Number(totalWeightChange ?? 0) <= 0 ? TrendingDown : TrendingUp,
      trend: weightTimeline.length === 0 
        ? "Log body metrics to track" 
        : weightTimeline.length === 1 
          ? `Current: ${weightTimeline[0].weight} kg` 
          : `${weightTimeline[0].weight} → ${weightTimeline[weightTimeline.length - 1].weight} kg`,
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

  const loading = profileLoading || metricsLoading;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Health & Analytics</h1>
        <p className="text-muted-foreground">Monitor health metrics and analyze training progress</p>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Loading health & analytics data...</div>
      ) : (
        <Tabs defaultValue="health" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8 max-w-md">
            <TabsTrigger value="health" className="text-sm font-medium">Health Metrics</TabsTrigger>
            <TabsTrigger value="analytics" className="text-sm font-medium">Progress Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="health" className="space-y-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {healthMetrics.map((m, i) => (
                <motion.div key={m.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="bg-card rounded-xl border p-5 shadow-card hover:shadow-card-hover transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${m.color === "primary" ? "bg-primary/10" : "bg-accent/10"}`}>
                      <m.icon className={`h-5 w-5 ${m.color === "primary" ? "text-primary" : "text-accent"}`} />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{m.label}</p>
                      <p className="text-2xl font-display font-bold">{m.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{m.status}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-2xl border p-6 shadow-card mb-6">
              <h3 className="font-display font-semibold text-lg mb-4">BMI Scale</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Underweight</span><span>Normal</span><span>Overweight</span><span>Obese</span>
                </div>
                <div className="h-3 rounded-full bg-secondary overflow-hidden flex">
                  <div className="w-[20%] bg-chart-2 h-full" />
                  <div className="w-[30%] bg-primary h-full" />
                  <div className="w-[25%] bg-accent h-full" />
                  <div className="w-[25%] bg-destructive h-full" />
                </div>
                {typeof bmi === "number" && (
                  <div className="relative">
                    <div className="absolute" style={{ left: `${Math.min(Math.max(((bmi - 15) / 25) * 100, 2), 98)}%` }}>
                      <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-transparent border-b-foreground transform -translate-x-1/2" />
                      <p className="text-xs font-bold text-center mt-0.5 -translate-x-1/2">{bmi}</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Log Body Metrics */}
            <div className="flex justify-end mb-4">
              <Button onClick={() => setShowLogForm(!showLogForm)} className="bg-gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" /> Log Body Metrics
              </Button>
            </div>
            {showLogForm && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="bg-card rounded-2xl border p-6 shadow-card mb-6">
                <h3 className="font-display font-semibold mb-4">Log Body Metrics</h3>
                <div className="grid sm:grid-cols-3 gap-4 mb-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Weight (kg) *</Label>
                    <Input type="number" placeholder="75" value={logForm.weight_kg} onChange={(e) => setLogForm({ ...logForm, weight_kg: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Body Fat % (optional)</Label>
                    <Input type="number" placeholder="18.5" value={logForm.body_fat_percentage} onChange={(e) => setLogForm({ ...logForm, body_fat_percentage: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Muscle Mass kg (optional)</Label>
                    <Input type="number" placeholder="45" value={logForm.muscle_mass_kg} onChange={(e) => setLogForm({ ...logForm, muscle_mass_kg: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleLogMetrics} disabled={!logForm.weight_kg} className="bg-gradient-primary text-primary-foreground">Save Entry</Button>
                  <Button variant="outline" onClick={() => setShowLogForm(false)}>Cancel</Button>
                </div>
              </motion.div>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
              {bodyFatData.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-card rounded-2xl border p-6 shadow-card">
                  <h3 className="font-display font-semibold text-lg mb-1">Body Fat Trend</h3>
                  <p className="text-sm text-muted-foreground mb-6">Historical data</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={bodyFatData}>
                      <defs><linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.875rem" }} />
                      <Area type="monotone" dataKey="fat" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#fatGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </motion.div>
              )}
              {weightData.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-card rounded-2xl border p-6 shadow-card">
                  <h3 className="font-display font-semibold text-lg mb-1">Weight Trend</h3>
                  <p className="text-sm text-muted-foreground mb-6">Historical data</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={weightData}>
                      <defs><linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={['dataMin - 2', 'dataMax + 2']} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.875rem" }} />
                      <Area type="monotone" dataKey="weight" stroke="hsl(var(--chart-3))" strokeWidth={2} fill="url(#weightGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </motion.div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
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
                  <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Log at least 2 entries to see your weight trend.</div>
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
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
