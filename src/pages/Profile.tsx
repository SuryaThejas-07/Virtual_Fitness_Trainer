import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { User, Mail, Ruler, Weight, Target, Activity, Flame, Calculator, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useFirestore";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";

function computeMetrics(
  age: number,
  gender: string,
  heightCm: number,
  weightKg: number,
  activityLevel: string
): { bmi: number; bmr: number; tdee: number } | null {
  if (!age || !heightCm || !weightKg || !gender) return null;
  const heightM = heightCm / 100;
  const bmi = Number((weightKg / (heightM * heightM)).toFixed(1));
  const isMale = gender.toLowerCase() === "male";
  const bmr = Math.round(
    isMale
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161
  );
  const multipliers: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };
  const tdee = Math.round(bmr * (multipliers[activityLevel?.toLowerCase()] ?? 1.55));
  return { bmi, bmr, tdee };
}

export default function Profile() {
  const { user } = useAuth();
  const { profile, loading } = useUserProfile();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    age: "",
    gender: "",
    height_cm: "",
    weight_kg: "",
    fitness_goal: "",
    activity_level: "",
    bmr: "",
    tdee: "",
    bmi: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name || "",
        email: profile.email || "",
        age: String(profile.age || ""),
        gender: profile.gender || "",
        height_cm: String(profile.height_cm || ""),
        weight_kg: String(profile.weight_kg || ""),
        fitness_goal: profile.fitness_goal || "",
        activity_level: profile.activity_level || "",
        bmr: String(profile.bmr || ""),
        tdee: String(profile.tdee || ""),
        bmi: String(profile.bmi || ""),
      });
    }
  }, [profile]);

  // Auto-recompute BMI/BMR/TDEE whenever relevant fields change
  useEffect(() => {
    const computed = computeMetrics(
      Number(form.age),
      form.gender,
      Number(form.height_cm),
      Number(form.weight_kg),
      form.activity_level
    );
    if (computed) {
      setForm((prev) => ({
        ...prev,
        bmi: String(computed.bmi),
        bmr: String(computed.bmr),
        tdee: String(computed.tdee),
      }));
    }
  }, [form.age, form.gender, form.height_cm, form.weight_kg, form.activity_level]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        name: form.name,
        age: Number(form.age) || 0,
        gender: form.gender,
        height_cm: Number(form.height_cm) || 0,
        weight_kg: Number(form.weight_kg) || 0,
        fitness_goal: form.fitness_goal,
        activity_level: form.activity_level,
        bmr: Number(form.bmr) || 0,
        tdee: Number(form.tdee) || 0,
        bmi: Number(form.bmi) || 0,
      });
      toast({ title: "Profile updated", description: "Your changes have been saved." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">Loading profile...</div>;
  }

  const infoCards = [
    { label: "BMI", value: form.bmi || "--", icon: Calculator, color: "primary" },
    { label: "BMR", value: form.bmr ? `${form.bmr} kcal` : "--", icon: Flame, color: "accent" },
    { label: "TDEE", value: form.tdee ? `${form.tdee} kcal` : "--", icon: Activity, color: "primary" },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">My Profile</h1>
        <p className="text-muted-foreground">View and update your personal information</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {infoCards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-card rounded-xl border p-4 shadow-card text-center"
          >
            <div className={`h-10 w-10 rounded-lg mx-auto mb-2 flex items-center justify-center ${c.color === "primary" ? "bg-primary/10" : "bg-accent/10"}`}>
              <c.icon className={`h-5 w-5 ${c.color === "primary" ? "text-primary" : "text-accent"}`} />
            </div>
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-lg font-display font-bold">{c.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Edit Form */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card rounded-2xl border p-6 shadow-card space-y-5"
      >
        <h3 className="font-display font-semibold text-lg">Personal Details</h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm mb-1.5 block">Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-10" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-10" value={form.email} disabled />
            </div>
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Age</Label>
            <Input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Gender</Label>
            <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Height (cm)</Label>
            <div className="relative">
              <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="number" className="pl-10" value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Weight (kg)</Label>
            <div className="relative">
              <Weight className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="number" className="pl-10" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Fitness Goal</Label>
            <Select value={form.fitness_goal} onValueChange={(v) => setForm({ ...form, fitness_goal: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fat_loss">Fat Loss</SelectItem>
                <SelectItem value="muscle_gain">Muscle Gain</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="endurance">Endurance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Activity Level</Label>
            <Select value={form.activity_level} onValueChange={(v) => setForm({ ...form, activity_level: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentary">Sedentary</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="very_active">Very Active</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving} className="bg-gradient-primary text-primary-foreground">
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
