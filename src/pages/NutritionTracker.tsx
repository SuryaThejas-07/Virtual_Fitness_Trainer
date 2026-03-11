import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Plus, Apple, Beef, Wheat, Droplets, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { useFirestoreCollection, useGoals, addFirestoreDoc, deleteFirestoreDoc } from "@/hooks/useFirestore";
import { serverTimestamp } from "firebase/firestore";

type TimestampLike = { toDate: () => Date };
type DateLike = TimestampLike | Date | null | undefined;

interface NutritionEntry {
  id: string;
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  meal_type: string;
  date: DateLike;
}

function isToday(ts: DateLike): boolean {
  const d: Date | null = ts?.toDate?.() ?? (ts instanceof Date ? ts : null);
  if (!d) return true; // serverTimestamp() is still pending — include it
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

export default function NutritionTracker() {
  const { user } = useAuth();
  const { data: foods, loading } = useFirestoreCollection<NutritionEntry>("nutrition");
  const { data: goalsData } = useGoals();
  const [form, setForm] = useState({ name: "", calories: "", protein: "", carbs: "", fats: "", meal: "lunch" });
  const [showForm, setShowForm] = useState(false);

  const goal = goalsData[0] || { daily_calories: 2200, protein_target_g: 150, carbs_target_g: 250, fats_target_g: 65 };

  const todayFoods = useMemo(() => foods.filter(f => isToday(f.date)), [foods]);

  const totals = useMemo(() => todayFoods.reduce(
    (acc, f) => ({ calories: acc.calories + (f.calories || 0), protein: acc.protein + (f.protein_g || 0), carbs: acc.carbs + (f.carbs_g || 0), fats: acc.fats + (f.fats_g || 0) }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  ), [todayFoods]);

  const addFood = async () => {
    if (!form.name || !user) return;
    await addFirestoreDoc("nutrition", user.uid, {
      food_name: form.name,
      calories: +form.calories || 0,
      protein_g: +form.protein || 0,
      carbs_g: +form.carbs || 0,
      fats_g: +form.fats || 0,
      meal_type: form.meal,
      date: serverTimestamp(),
    });
    setForm({ name: "", calories: "", protein: "", carbs: "", fats: "", meal: "lunch" });
    setShowForm(false);
  };

  const macros = [
    { label: "Calories", value: totals.calories, goal: goal.daily_calories || 2200, unit: "kcal", icon: Apple, color: "text-accent" },
    { label: "Protein", value: totals.protein, goal: goal.protein_target_g || 150, unit: "g", icon: Beef, color: "text-primary" },
    { label: "Carbs", value: totals.carbs, goal: goal.carbs_target_g || 250, unit: "g", icon: Wheat, color: "text-chart-2" },
    { label: "Fats", value: totals.fats, goal: goal.fats_target_g || 65, unit: "g", icon: Droplets, color: "text-chart-4" },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">Nutrition Tracker</h1>
          <p className="text-muted-foreground">Track your daily meals and macros</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" /> Log Food
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {macros.map((m, i) => (
          <motion.div key={m.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="bg-card rounded-xl border p-5 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{m.label}</span>
              <m.icon className={`h-5 w-5 ${m.color}`} />
            </div>
            <p className="text-2xl font-display font-bold mb-1">
              {m.value}<span className="text-sm font-normal text-muted-foreground ml-1">/ {m.goal}{m.unit}</span>
            </p>
            <Progress value={Math.min((m.value / m.goal) * 100, 100)} className="h-2 mt-2" />
          </motion.div>
        ))}
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="bg-card rounded-2xl border p-6 shadow-card mb-8">
          <h3 className="font-display font-semibold mb-4">Add Food Item</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div><Label className="text-sm mb-1.5 block">Food Name</Label><Input placeholder="e.g., Chicken Breast" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label className="text-sm mb-1.5 block">Calories</Label><Input type="number" placeholder="320" value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })} /></div>
            <div><Label className="text-sm mb-1.5 block">Protein (g)</Label><Input type="number" placeholder="45" value={form.protein} onChange={(e) => setForm({ ...form, protein: e.target.value })} /></div>
            <div><Label className="text-sm mb-1.5 block">Carbs (g)</Label><Input type="number" placeholder="0" value={form.carbs} onChange={(e) => setForm({ ...form, carbs: e.target.value })} /></div>
            <div><Label className="text-sm mb-1.5 block">Fats (g)</Label><Input type="number" placeholder="14" value={form.fats} onChange={(e) => setForm({ ...form, fats: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={addFood} className="bg-gradient-primary text-primary-foreground">Add Food</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </motion.div>
      )}

      <div className="bg-card rounded-2xl border shadow-card overflow-hidden">
        <div className="p-5 border-b"><h3 className="font-display font-semibold">Today's Food Log</h3></div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : todayFoods.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No food logged today. Hit "Log Food" to start!</div>
        ) : (
          <div className="divide-y">
            {todayFoods.map((f, i) => (
              <motion.div key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="flex items-center justify-between p-4 hover:bg-secondary/20 transition-colors">
                <div>
                  <p className="font-medium">{f.food_name}</p>
                  <p className="text-sm text-muted-foreground">{f.calories} kcal • P: {f.protein_g}g • C: {f.carbs_g}g • F: {f.fats_g}g • {f.meal_type}</p>
                </div>
                <button onClick={() => deleteFirestoreDoc("nutrition", f.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
