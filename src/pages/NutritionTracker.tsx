import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Apple, Beef, Wheat, Droplets, Trash2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useFirestoreCollection, useGoals, useUserProfile, addFirestoreDoc, deleteFirestoreDoc } from "@/hooks/useFirestore";
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

const commonFoods: Record<string, { calories: number; protein: number; carbs: number; fats: number; meal: string }> = {
  "Chicken Breast (150g)": { calories: 247, protein: 46, carbs: 0, fats: 5, meal: "lunch" },
  "Whole Egg (Large)": { calories: 70, protein: 6, carbs: 0.6, fats: 5, meal: "breakfast" },
  "Oatmeal (1 Cup Cooked)": { calories: 150, protein: 6, carbs: 27, fats: 3, meal: "breakfast" },
  "Whey Protein (1 Scoop)": { calories: 120, protein: 24, carbs: 3, fats: 1.5, meal: "snack" },
  "Banana (Medium)": { calories: 105, protein: 1.3, carbs: 27, fats: 0.3, meal: "snack" },
  "White Rice (1 Cup Cooked)": { calories: 205, protein: 4.2, carbs: 44, fats: 0.4, meal: "lunch" },
  "Salmon Fillet (150g)": { calories: 312, protein: 33, carbs: 0, fats: 18, meal: "dinner" },
  "Apple (Medium)": { calories: 95, protein: 0.5, carbs: 25, fats: 0.3, meal: "snack" },
  "Greek Yogurt (150g)": { calories: 100, protein: 15, carbs: 6, fats: 0, meal: "breakfast" },
  "Almonds (28g / 23 nuts)": { calories: 164, protein: 6, carbs: 6, fats: 14, meal: "snack" },
};

// Robust parser for firestore Timestamps / Dates / strings
function getMillis(val: unknown): number {
  if (!val) return 0;
  if (val instanceof Date) return val.getTime();
  
  const obj = val as Record<string, unknown>;
  if (obj && typeof obj.toDate === "function") return (obj.toDate as () => Date)().getTime();
  if (obj && typeof obj.getTime === "function") return (obj.getTime as () => number)();
  if (typeof val === "number") return val;
  if (typeof val === "string") return Date.parse(val) || 0;
  if (obj && typeof obj.seconds === "number") {
    return obj.seconds * 1000 + Math.floor((Number(obj.nanoseconds) || 0) / 1000000);
  }
  return 0;
}

function isToday(ts: DateLike): boolean {
  if (!ts) return true; // serverTimestamp() is still pending — include it
  const ms = getMillis(ts);
  if (ms === 0) return true;
  const d = new Date(ms);
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

export default function NutritionTracker() {
  const { user } = useAuth();
  const { data: foods, loading } = useFirestoreCollection<NutritionEntry>("nutrition", "date");
  const [localFoods, setLocalFoods] = useState<NutritionEntry[]>([]);
  const { data: goalsData } = useGoals();
  const { profile } = useUserProfile();
  const [form, setForm] = useState({ name: "", calories: "", protein: "", carbs: "", fats: "", meal: "lunch" });
  const [selectedFoodOption, setSelectedFoodOption] = useState("");
  const [showForm, setShowForm] = useState(false);

  const goal = useMemo(() => {
    if (goalsData && goalsData.length > 0) {
      return goalsData[0];
    }
    if (profile) {
      const weight = profile.weight_kg ? Number(profile.weight_kg) : 70;
      const height = profile.height_cm ? Number(profile.height_cm) : 170;
      const age = profile.age ? Number(profile.age) : 30;
      const gender = profile.gender ? String(profile.gender) : "male";
      const activity = profile.activity_level ? String(profile.activity_level) : "moderate";
      const fitnessGoal = profile.fitness_goal ? String(profile.fitness_goal) : "maintenance";

      const isMale = gender.toLowerCase() === "male";
      const bmr = 10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161);
      
      const multipliers: Record<string, number> = {
        sedentary: 1.2,
        light: 1.375,
        moderate: 1.55,
        active: 1.725,
        very_active: 1.9,
      };
      const tdee = Math.round(bmr * (multipliers[activity.toLowerCase()] ?? 1.55));

      let calories = tdee;
      if (fitnessGoal === "fat_loss") {
        calories = tdee - 500;
      } else if (fitnessGoal === "muscle_gain") {
        calories = tdee + 500;
      } else if (fitnessGoal === "endurance") {
        calories = tdee + 300;
      }
      calories = Math.max(calories, 1200);

      let proteinMultiplier = 1.8;
      if (fitnessGoal === "muscle_gain") proteinMultiplier = 2.0;
      else if (fitnessGoal === "fat_loss") proteinMultiplier = 2.2;
      else if (fitnessGoal === "endurance") proteinMultiplier = 1.6;

      const protein = Math.round(weight * proteinMultiplier) || 150;
      const fats = Math.round((calories * 0.25) / 9) || 65;
      const carbs = Math.round((calories - (protein * 4) - (fats * 9)) / 4) || 250;

      return {
        daily_calories: calories,
        protein_target_g: protein,
        carbs_target_g: carbs,
        fats_target_g: fats,
      };
    }
    return { daily_calories: 2200, protein_target_g: 150, carbs_target_g: 250, fats_target_g: 65 };
  }, [goalsData, profile]);

  useEffect(() => {
    setLocalFoods((prev) => {
      const tempItems = prev.filter((f) => f.id.startsWith("temp-"));
      const filteredTempItems = tempItems.filter(
        (temp) =>
          !foods.some(
            (f) =>
              f.food_name === temp.food_name &&
              f.calories === temp.calories &&
              f.meal_type === temp.meal_type
          )
      );
      return [...filteredTempItems, ...foods];
    });
  }, [foods]);

  const todayFoods = useMemo(() => localFoods.filter(f => isToday(f.date)), [localFoods]);

  const totals = useMemo(() => todayFoods.reduce(
    (acc, f) => ({ calories: acc.calories + (f.calories || 0), protein: acc.protein + (f.protein_g || 0), carbs: acc.carbs + (f.carbs_g || 0), fats: acc.fats + (f.fats_g || 0) }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  ), [todayFoods]);

  const addFood = async () => {
    if (!form.name || !user) return;
    const newFoodData = {
      food_name: form.name,
      calories: +form.calories || 0,
      protein_g: +form.protein || 0,
      carbs_g: +form.carbs || 0,
      fats_g: +form.fats || 0,
      meal_type: form.meal,
      date: new Date(),
    };

    const tempId = `temp-${Date.now()}`;
    const tempFood: NutritionEntry = {
      id: tempId,
      ...newFoodData,
    };

    setLocalFoods((prev) => [tempFood, ...prev]);
    setForm({ name: "", calories: "", protein: "", carbs: "", fats: "", meal: "lunch" });
    setSelectedFoodOption("");
    setShowForm(false);

    try {
      await addFirestoreDoc("nutrition", user.uid, {
        ...newFoodData,
        date: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to add food:", err);
      setLocalFoods((prev) => prev.filter((f) => f.id !== tempId));
    }
  };

  const deleteFood = async (id: string) => {
    setLocalFoods((prev) => prev.filter((f) => f.id !== id));
    try {
      await deleteFirestoreDoc("nutrition", id);
    } catch (err) {
      console.error("Failed to delete food:", err);
    }
  };

  const handleRepeatFood = async (f: NutritionEntry) => {
    if (!user) return;
    const newFoodData = {
      food_name: f.food_name,
      calories: f.calories ?? 0,
      protein_g: f.protein_g ?? 0,
      carbs_g: f.carbs_g ?? 0,
      fats_g: f.fats_g ?? 0,
      meal_type: f.meal_type,
      date: new Date(),
    };

    const tempId = `temp-${Date.now()}`;
    const tempFood: NutritionEntry = {
      id: tempId,
      ...newFoodData,
    };

    setLocalFoods((prev) => [tempFood, ...prev]);

    try {
      await addFirestoreDoc("nutrition", user.uid, {
        ...newFoodData,
        date: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to repeat food:", err);
      setLocalFoods((prev) => prev.filter((item) => item.id !== tempId));
    }
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-4">
            <div>
              <Label className="text-sm mb-1.5 block">Choose Food</Label>
              <Select
                value={selectedFoodOption}
                onValueChange={(v) => {
                  setSelectedFoodOption(v);
                  if (v !== "Other") {
                    const data = commonFoods[v];
                    setForm({
                      name: v,
                      calories: String(data.calories),
                      protein: String(data.protein),
                      carbs: String(data.carbs),
                      fats: String(data.fats),
                      meal: data.meal,
                    });
                  } else {
                    setForm({
                      name: "",
                      calories: "",
                      protein: "",
                      carbs: "",
                      fats: "",
                      meal: "lunch",
                    });
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(commonFoods).map((food) => (
                    <SelectItem key={food} value={food}>{food}</SelectItem>
                  ))}
                  <SelectItem value="Other">Other / Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedFoodOption === "Other" ? (
              <div>
                <Label className="text-sm mb-1.5 block">Custom Name</Label>
                <Input
                  placeholder="e.g., Steak"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            ) : (
              <div>
                <Label className="text-sm mb-1.5 block">Food Name</Label>
                <Input
                  value={form.name}
                  disabled
                  placeholder="Select a food"
                />
              </div>
            )}

            <div><Label className="text-sm mb-1.5 block">Calories</Label><Input type="number" placeholder="320" value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })} /></div>
            <div><Label className="text-sm mb-1.5 block">Protein (g)</Label><Input type="number" placeholder="45" value={form.protein} onChange={(e) => setForm({ ...form, protein: e.target.value })} /></div>
            <div><Label className="text-sm mb-1.5 block">Carbs (g)</Label><Input type="number" placeholder="0" value={form.carbs} onChange={(e) => setForm({ ...form, carbs: e.target.value })} /></div>
            <div><Label className="text-sm mb-1.5 block">Fats (g)</Label><Input type="number" placeholder="14" value={form.fats} onChange={(e) => setForm({ ...form, fats: e.target.value })} /></div>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-4">
            <div>
              <Label className="text-sm mb-1.5 block">Meal Type</Label>
              <Select value={form.meal} onValueChange={(v) => setForm({ ...form, meal: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Meal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                    onClick={() => handleRepeatFood(f)}
                    title="Repeat Food Entry"
                  >
                    <Repeat className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteFood(f.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
