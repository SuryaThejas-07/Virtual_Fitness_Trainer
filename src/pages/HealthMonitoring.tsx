import { useState } from "react";
import { motion } from "framer-motion";
import { HeartPulse, Scale, Percent, Dumbbell, Flame, Plus } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBodyMetrics, useUserProfile, addFirestoreDoc } from "@/hooks/useFirestore";
import { useAuth } from "@/contexts/AuthContext";
import { serverTimestamp } from "firebase/firestore";

export default function HealthMonitoring() {
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();
  const { data: metrics, loading: metricsLoading } = useBodyMetrics();
  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState({ weight_kg: "", body_fat_percentage: "", muscle_mass_kg: "" });

  // metrics is already sorted newest-first by useFirestoreCollection
  const latest = metrics[0] || {};

  const handleLogMetrics = async () => {
    if (!logForm.weight_kg || !user) return;
    const w = parseFloat(logForm.weight_kg);
    const h = profile?.height_cm ? parseFloat(String(profile.height_cm)) : 0;
    const bmiVal = h ? Number((w / Math.pow(h / 100, 2)).toFixed(1)) : null;
    await addFirestoreDoc("body_metrics", user.uid, {
      weight_kg: w,
      body_fat_percentage: logForm.body_fat_percentage ? parseFloat(logForm.body_fat_percentage) : null,
      muscle_mass_kg: logForm.muscle_mass_kg ? parseFloat(logForm.muscle_mass_kg) : null,
      bmi: bmiVal,
      recorded_at: serverTimestamp(),
    });
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

  const bodyFatData = metrics.map((m) => ({
    date: m.recorded_at?.toDate?.()?.toLocaleDateString?.() || "—",
    fat: m.body_fat_percentage || 0,
  })).reverse();

  const weightData = metrics.map((m) => ({
    date: m.recorded_at?.toDate?.()?.toLocaleDateString?.() || "—",
    weight: m.weight_kg || 0,
  })).reverse();

  const loading = profileLoading || metricsLoading;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Health Monitoring</h1>
        <p className="text-muted-foreground">Track your key health metrics and body composition</p>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Loading health data...</div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
