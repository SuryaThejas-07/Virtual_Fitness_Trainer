import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useFirestoreCollection, addFirestoreDoc, deleteFirestoreDoc } from "@/hooks/useFirestore";
import { serverTimestamp } from "firebase/firestore";

type TimestampLike = { toDate: () => Date };

interface Workout {
  id: string;
  exercise_name: string;
  sets?: number;
  reps?: number;
  duration_minutes?: number;
  calories_burned?: number;
  workout_type?: string;
  ai_detected?: boolean;
  target_seconds?: number;
  timestamp: TimestampLike | Date | null;
}

const displayWorkoutType = (workout: Workout): string => {
  const type = (workout.workout_type ?? "").toLowerCase();

  if (type.includes("chatbot")) return "Chatbot";
  if (type.includes("ai trainer") || type.includes("ai_trainer")) return "AI Trainer";
  if (type.includes("user") || type.includes("strength")) return "User Logged";

  // Backward compatibility: older chatbot logs were saved with ai_detected=true + user logged type.
  if (workout.ai_detected && type.includes("user logged")) return "Chatbot";
  if (workout.ai_detected) return "AI Trainer";

  return "User Logged";
};

const isPlankWorkout = (workout: Workout): boolean => {
  return workout.exercise_name.toLowerCase() === "plank" || (workout.target_seconds ?? 0) > 0;
};

export default function WorkoutTracker() {
  const { user } = useAuth();
  const { data: workouts, loading } = useFirestoreCollection<Workout>("workouts");
  const [localWorkouts, setLocalWorkouts] = useState<Workout[]>([]);
  const [form, setForm] = useState({ exercise: "", sets: "", reps: "", duration: "", calories: "", type: "User Logged" });
  const [customExercise, setCustomExercise] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setLocalWorkouts((prev) => {
      const tempItems = prev.filter((w) => w.id.startsWith("temp-"));
      const filteredTempItems = tempItems.filter(
        (temp) =>
          !workouts.some(
            (w) =>
              w.exercise_name === temp.exercise_name &&
              w.sets === temp.sets &&
              w.reps === temp.reps
          )
      );
      return [...filteredTempItems, ...workouts];
    });
  }, [workouts]);

  const addWorkout = async () => {
    const exerciseName = form.exercise === "Other" ? customExercise || "Custom Exercise" : form.exercise;
    if (!exerciseName || !user) return;
    const newWorkoutData = {
      exercise_name: exerciseName,
      sets: Number(form.sets) || 0,
      reps: Number(form.reps) || 0,
      duration_minutes: Number(form.duration) || 0,
      calories_burned: Number(form.calories) || 0,
      workout_type: "User Logged",
      ai_detected: false,
      timestamp: new Date(),
    };

    const tempId = `temp-${Date.now()}`;
    const tempWorkout: Workout = {
      id: tempId,
      ...newWorkoutData,
    };

    setLocalWorkouts((prev) => [tempWorkout, ...prev]);
    setForm({ exercise: "", sets: "", reps: "", duration: "", calories: "", type: "User Logged" });
    setCustomExercise("");
    setShowForm(false);

    try {
      await addFirestoreDoc("workouts", user.uid, {
        ...newWorkoutData,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to add workout:", err);
      setLocalWorkouts((prev) => prev.filter((w) => w.id !== tempId));
    }
  };

  const deleteWorkout = async (id: string) => {
    setLocalWorkouts((prev) => prev.filter((w) => w.id !== id));
    try {
      await deleteFirestoreDoc("workouts", id);
    } catch (err) {
      console.error("Failed to delete workout:", err);
    }
  };

  const handleRepeatWorkout = async (w: Workout) => {
    if (!user) return;
    const newWorkoutData = {
      exercise_name: w.exercise_name,
      sets: w.sets ?? 0,
      reps: w.reps ?? 0,
      duration_minutes: w.duration_minutes ?? 0,
      calories_burned: w.calories_burned ?? 0,
      workout_type: "User Logged",
      ai_detected: false,
      timestamp: new Date(),
    };

    const tempId = `temp-${Date.now()}`;
    const tempWorkout: Workout = {
      id: tempId,
      ...newWorkoutData,
    };

    setLocalWorkouts((prev) => [tempWorkout, ...prev]);

    try {
      await addFirestoreDoc("workouts", user.uid, {
        ...newWorkoutData,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to repeat workout:", err);
      setLocalWorkouts((prev) => prev.filter((item) => item.id !== tempId));
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">Workout Tracker</h1>
          <p className="text-muted-foreground">Log and track your training sessions</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-gradient-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" /> Log Workout
        </Button>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="bg-card rounded-2xl border p-6 shadow-card mb-8">
          <h3 className="font-display font-semibold mb-4">New Workout Entry</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-4">
            <div>
              <Label className="text-sm mb-1.5 block">Exercise</Label>
              <Select
                value={form.exercise}
                onValueChange={(v) => {
                  let sets = form.sets || "3";
                  let reps = form.reps || "12";
                  let duration = form.duration || "15";
                  let calories = form.calories || "150";

                  if (v === "Plank") {
                    reps = "0";
                    sets = "1";
                    duration = "1";
                    calories = "15";
                  } else if (v === "Jumping Jack") {
                    reps = "30";
                    calories = "60";
                  } else if (v === "Biceps Curl") {
                    calories = "80";
                  } else if (v === "Squat") {
                    calories = "120";
                  } else if (v === "Pushup") {
                    calories = "100";
                  } else if (v === "Lunge") {
                    calories = "110";
                  }

                  setForm({ ...form, exercise: v, sets, reps, duration, calories });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Biceps Curl">Biceps Curl</SelectItem>
                  <SelectItem value="Squat">Squat</SelectItem>
                  <SelectItem value="Pushup">Pushup</SelectItem>
                  <SelectItem value="Lunge">Lunge</SelectItem>
                  <SelectItem value="Jumping Jack">Jumping Jack</SelectItem>
                  <SelectItem value="Plank">Plank</SelectItem>
                  <SelectItem value="Other">Custom / Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.exercise === "Other" && (
              <div>
                <Label className="text-sm mb-1.5 block">Custom Name</Label>
                <Input
                  placeholder="e.g., Bench Press"
                  value={customExercise}
                  onChange={(e) => setCustomExercise(e.target.value)}
                />
              </div>
            )}

            <div><Label className="text-sm mb-1.5 block">Sets</Label><Input type="number" placeholder="3" value={form.sets} onChange={(e) => setForm({ ...form, sets: e.target.value })} /></div>
            <div><Label className="text-sm mb-1.5 block">Reps</Label><Input type="number" placeholder="12" value={form.reps} onChange={(e) => setForm({ ...form, reps: e.target.value })} /></div>
            <div><Label className="text-sm mb-1.5 block">Duration (min)</Label><Input type="number" placeholder="15" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></div>
            <div><Label className="text-sm mb-1.5 block">Calories</Label><Input type="number" placeholder="180" value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={addWorkout} className="bg-gradient-primary text-primary-foreground">Save Workout</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </motion.div>
      )}

      <div className="bg-card rounded-2xl border shadow-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading workouts...</div>
        ) : localWorkouts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No workouts logged yet. Start by adding one!</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/30">
                  <th className="text-left p-4 text-sm font-semibold text-muted-foreground">Exercise</th>
                  <th className="text-center p-4 text-sm font-semibold text-muted-foreground">Sets</th>
                  <th className="text-center p-4 text-sm font-semibold text-muted-foreground">Reps</th>
                  <th className="text-center p-4 text-sm font-semibold text-muted-foreground">Duration</th>
                  <th className="text-center p-4 text-sm font-semibold text-muted-foreground">Calories</th>
                  <th className="text-center p-4 text-sm font-semibold text-muted-foreground">Type</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {localWorkouts.map((w, i) => (
                  <motion.tr key={w.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="border-b last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="p-4 font-medium">{w.exercise_name}</td>
                    <td className="p-4 text-center">{w.sets ?? 0}</td>
                    <td className="p-4 text-center">{isPlankWorkout(w) ? "-" : (w.reps ?? 0)}</td>
                    <td className="p-4 text-center text-muted-foreground">{(w.duration_minutes ?? 0).toFixed(1)} min</td>
                    <td className="p-4 text-center"><span className="text-accent font-medium">{(w.calories_burned ?? 0).toFixed(1)} kcal</span></td>
                    <td className="p-4 text-center text-sm text-muted-foreground">{displayWorkoutType(w)}</td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                          onClick={() => handleRepeatWorkout(w)}
                          title="Repeat Workout"
                        >
                          <Repeat className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteWorkout(w.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
