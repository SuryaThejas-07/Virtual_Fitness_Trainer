import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Dumbbell, ArrowRight, Play, Target, Cpu, Lightbulb,
  ChevronDown, X, Activity, Eye, RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import trainerAvatar from "@/assets/trainer-avatar.png";
import ExerciseAnimation from "@/components/ExerciseAnimation";

interface Exercise {
  name: string;
  muscle: string;
  difficulty: string;
  detection: string;
  steps: string[];
  image: string;
  muscles: { name: string; primary: boolean }[];
  aiDetection: { jointsTracked: string[]; postureAnalysis: string; repDetection: string };
  trainerTip: string;
}

const exercises: Exercise[] = [
  {
    name: "Biceps Curl",
    muscle: "Biceps",
    difficulty: "Beginner",
    detection: "Tracks elbow angle and wrist position to count curls and detect full range of motion.",
    steps: [
      "Stand with feet shoulder-width apart, holding weights at your sides with palms facing forward.",
      "Keep your elbows close to your torso — they should not drift forward or backward.",
      "Curl the weights upward by contracting your biceps, bringing them to shoulder level.",
      "Pause at the top and squeeze the biceps for maximum contraction.",
      "Slowly lower the weights back to the starting position with control.",
      "Repeat for the desired number of reps without swinging your body."
    ],
    image: "💪",
    muscles: [
      { name: "Biceps Brachii", primary: true },
      { name: "Brachialis", primary: true },
      { name: "Forearms", primary: false },
      { name: "Anterior Deltoid", primary: false },
    ],
    aiDetection: {
      jointsTracked: ["Shoulder", "Elbow", "Wrist"],
      postureAnalysis: "Monitors elbow position relative to torso to prevent swinging. Checks shoulder stability throughout the movement.",
      repDetection: "A rep is counted when the elbow angle goes from ~170° (extended) to ~40° (fully curled) and back.",
    },
    trainerTip: "Keep your elbows pinned to your sides. If you're swinging the weight, it's too heavy — drop down and focus on the squeeze!",
  },
  {
    name: "Squat",
    muscle: "Quadriceps, Glutes",
    difficulty: "Beginner",
    detection: "Monitors hip and knee angles to ensure proper depth and back alignment.",
    steps: [
      "Stand with feet shoulder-width apart, toes slightly turned out.",
      "Engage your core and keep your chest lifted throughout the movement.",
      "Initiate the squat by pushing your hips back, as if sitting into a chair.",
      "Lower your body until your thighs are at least parallel to the floor.",
      "Keep your knees tracking over your toes — don't let them cave inward.",
      "Drive through your heels to return to the starting position."
    ],
    image: "🏋️",
    muscles: [
      { name: "Quadriceps", primary: true },
      { name: "Glutes", primary: true },
      { name: "Hamstrings", primary: false },
      { name: "Core", primary: false },
      { name: "Calves", primary: false },
    ],
    aiDetection: {
      jointsTracked: ["Hip", "Knee", "Ankle", "Shoulder"],
      postureAnalysis: "Checks that the back remains neutral (not rounded). Monitors knee valgus (knees caving in) and ensures proper depth.",
      repDetection: "A rep is counted when hip angle drops below 90° (parallel) and returns above 160° (standing).",
    },
    trainerTip: "Imagine you're sitting back into a chair. Keep your weight on your heels and your chest proud — never let your knees shoot past your toes!",
  },
  {
    name: "Pushup",
    muscle: "Chest, Triceps",
    difficulty: "Intermediate",
    detection: "Tracks shoulder, elbow, and wrist alignment to verify proper form and depth.",
    steps: [
      "Start in a high plank position with hands slightly wider than shoulder-width.",
      "Your body should form a straight line from head to heels — engage your core.",
      "Lower your chest toward the floor by bending your elbows at a 45° angle.",
      "Go down until your chest is just above the ground (or touches lightly).",
      "Push through your palms to extend your arms and return to the start.",
      "Maintain the straight body line throughout — no sagging hips or piking up."
    ],
    image: "🤸",
    muscles: [
      { name: "Pectoralis Major", primary: true },
      { name: "Triceps", primary: true },
      { name: "Anterior Deltoid", primary: false },
      { name: "Core", primary: false },
      { name: "Serratus Anterior", primary: false },
    ],
    aiDetection: {
      jointsTracked: ["Shoulder", "Elbow", "Wrist", "Hip", "Ankle"],
      postureAnalysis: "Ensures body forms a straight line (no hip sag or pike). Monitors elbow angle to verify proper depth.",
      repDetection: "A rep is counted when elbow angle goes from ~180° (extended) to ~90° (lowered) and back to full extension.",
    },
    trainerTip: "Don't flare your elbows out to 90° — keep them at about 45° to protect your shoulders. Quality over quantity!",
  },
  {
    name: "Lunge",
    muscle: "Quadriceps, Hamstrings",
    difficulty: "Intermediate",
    detection: "Analyzes knee angles and hip alignment for balanced lunges and proper knee tracking.",
    steps: [
      "Stand tall with feet hip-width apart and hands on your hips or at your sides.",
      "Take a controlled step forward with one leg (about 2–3 feet).",
      "Lower your hips until both knees form 90° angles.",
      "Your front knee should be directly above your ankle, not past your toes.",
      "Your back knee should hover just above the ground.",
      "Push through your front heel to return to the starting position and alternate legs."
    ],
    image: "🦵",
    muscles: [
      { name: "Quadriceps", primary: true },
      { name: "Hamstrings", primary: true },
      { name: "Glutes", primary: true },
      { name: "Calves", primary: false },
      { name: "Core", primary: false },
    ],
    aiDetection: {
      jointsTracked: ["Hip", "Knee", "Ankle"],
      postureAnalysis: "Tracks front knee position relative to ankle. Monitors hip symmetry to ensure balanced lunges on both sides.",
      repDetection: "A rep is counted when the rear knee drops to near-ground level and the body returns to standing.",
    },
    trainerTip: "Think 'down' not 'forward' — your torso should drop straight down like an elevator. Keep your core tight for balance!",
  },
  {
    name: "Jumping Jack",
    muscle: "Full Body, Cardio",
    difficulty: "Beginner",
    detection: "Detects arm and leg spread patterns to count repetitions and maintain rhythm.",
    steps: [
      "Stand upright with your feet together and arms at your sides.",
      "Jump and simultaneously spread your legs wider than shoulder-width.",
      "At the same time, raise your arms overhead until they nearly touch.",
      "Jump again to return your feet together and arms to your sides.",
      "Maintain a steady, rhythmic pace throughout the set.",
      "Land softly on the balls of your feet to reduce impact on joints."
    ],
    image: "⭐",
    muscles: [
      { name: "Deltoids", primary: true },
      { name: "Calves", primary: true },
      { name: "Hip Abductors", primary: false },
      { name: "Core", primary: false },
      { name: "Quadriceps", primary: false },
    ],
    aiDetection: {
      jointsTracked: ["Shoulder", "Wrist", "Hip", "Ankle"],
      postureAnalysis: "Monitors arm raise symmetry and leg spread width. Ensures full range of motion for each repetition.",
      repDetection: "A rep is counted when limbs spread to full extension and return to the resting position.",
    },
    trainerTip: "Keep your movements crisp and controlled — fully extend your arms overhead and bring your feet wide. It's cardio, but form still matters!",
  },
  {
    name: "Plank",
    muscle: "Core, Shoulders",
    difficulty: "Intermediate",
    detection: "Monitors body alignment to ensure straight line from head to heels and detect hip drops.",
    steps: [
      "Start face-down on the floor, then prop yourself up on your forearms and toes.",
      "Your elbows should be directly beneath your shoulders.",
      "Engage your core, glutes, and quads to keep your body in a straight line.",
      "Look at the floor slightly ahead of your hands to keep your neck neutral.",
      "Breathe steadily — don't hold your breath.",
      "Hold for the desired duration without letting your hips sag or pike up."
    ],
    image: "🧘",
    muscles: [
      { name: "Rectus Abdominis", primary: true },
      { name: "Transverse Abdominis", primary: true },
      { name: "Deltoids", primary: false },
      { name: "Erector Spinae", primary: false },
      { name: "Glutes", primary: false },
    ],
    aiDetection: {
      jointsTracked: ["Shoulder", "Hip", "Ankle", "Elbow"],
      postureAnalysis: "Checks that shoulder-hip-ankle forms a straight line. Detects hip drops or pike-ups that break proper plank form.",
      repDetection: "This is a hold exercise — the AI tracks duration and flags form breaks rather than counting reps.",
    },
    trainerTip: "Squeeze your glutes and brace your core like someone's about to poke your stomach. If your hips start sagging, take a short break — bad form builds bad habits!",
  },
];

const difficultyColor: Record<string, string> = {
  Beginner: "bg-primary/10 text-primary border-primary/20",
  Intermediate: "bg-accent/10 text-accent border-accent/20",
};

export default function ExerciseGuide() {
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const demoRef = useRef<HTMLDivElement>(null);

  const handleSelect = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setTimeout(() => {
      demoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Exercise Guide</h1>
        <p className="text-muted-foreground">Professional exercise library with AI detection info</p>
      </div>

      {/* Exercise Cards Grid */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
        {exercises.map((exercise, i) => (
          <motion.div
            key={exercise.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            whileHover={{ y: -4 }}
            onClick={() => handleSelect(exercise)}
            className={`bg-card rounded-2xl border shadow-card hover:shadow-card-hover transition-all overflow-hidden group cursor-pointer ${
              selectedExercise?.name === exercise.name ? "ring-2 ring-primary" : ""
            }`}
          >
            {/* Header */}
            <div className="bg-secondary/50 p-6 text-center border-b">
              <span className="text-5xl mb-3 block">{exercise.image}</span>
              <h3 className="font-display font-bold text-xl">{exercise.name}</h3>
              <div className="flex items-center justify-center gap-2 mt-2">
                <Badge variant="outline" className={difficultyColor[exercise.difficulty]}>
                  {exercise.difficulty}
                </Badge>
                <Badge variant="secondary">{exercise.muscle}</Badge>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Steps</p>
                <ol className="space-y-1.5">
                  {exercise.steps.slice(0, 4).map((step, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {j + 1}
                      </span>
                      {step.length > 60 ? step.slice(0, 57) + "…" : step}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">🤖 AI Detection</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{exercise.detection}</p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={(e) => { e.stopPropagation(); handleSelect(exercise); }}
                >
                  <Play className="h-4 w-4 mr-1" /> View Demo
                </Button>
                <Link to="/ai-trainer" className="flex-1" onClick={(e) => e.stopPropagation()}>
                  <Button className="w-full bg-gradient-primary text-primary-foreground" size="sm">
                    <Dumbbell className="h-4 w-4 mr-2" />
                    Start AI Trainer
                    <ArrowRight className="h-4 w-4 ml-auto" />
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Exercise Demo Section */}
      <div ref={demoRef} className="mt-12">
        <AnimatePresence mode="wait">
          {selectedExercise && (
            <motion.div
              key={selectedExercise.name}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35 }}
            >
              {/* Section Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center text-primary-foreground">
                    <Play className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-display font-bold">Exercise Demo</h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedExercise.name} — {selectedExercise.difficulty}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedExercise(null)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Main demo layout */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Left — Video / Image */}
                <div className="space-y-4">
                  <div className="rounded-2xl overflow-hidden border shadow-card bg-card">
                    <div className="aspect-square relative">
                      <ExerciseAnimation exercise={selectedExercise.name} />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-card to-transparent p-4">
                        <p className="text-lg font-display font-bold">
                          {selectedExercise.name}
                        </p>
                        <p className="text-sm text-muted-foreground">{selectedExercise.muscle}</p>
                      </div>
                    </div>
                  </div>

                  {/* Muscles Involved */}
                  <div className="bg-card rounded-2xl border shadow-card p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Target className="h-5 w-5 text-primary" />
                      <h3 className="font-display font-semibold text-lg">Muscles Involved</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedExercise.muscles.map((m) => (
                        <Badge
                          key={m.name}
                          variant={m.primary ? "default" : "secondary"}
                          className={
                            m.primary
                              ? "bg-primary/15 text-primary border border-primary/30 hover:bg-primary/20"
                              : ""
                          }
                        >
                          {m.primary && <span className="mr-1">●</span>}
                          {m.name}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      <span className="text-primary">●</span> Primary muscles &nbsp;|&nbsp; Secondary / stabilizer muscles
                    </p>
                  </div>

                  {/* Trainer Tip */}
                  <div className="bg-gradient-primary rounded-2xl p-5 shadow-card relative overflow-hidden">
                    <div className="absolute top-3 right-3 opacity-20">
                      <Lightbulb className="h-16 w-16" />
                    </div>
                    <div className="flex items-start gap-3 relative">
                      <img
                        src={trainerAvatar}
                        alt="Coach AI"
                        className="h-12 w-12 rounded-full border-2 border-primary-foreground/30 object-contain bg-primary-foreground/10 flex-shrink-0"
                      />
                      <div>
                        <p className="text-sm font-bold text-primary-foreground mb-1">Coach AI Tip</p>
                        <p className="text-sm text-primary-foreground/90 leading-relaxed">
                          "{selectedExercise.trainerTip}"
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right — Instructions & AI Info */}
                <div className="space-y-4">
                  {/* Step-by-step */}
                  <div className="bg-card rounded-2xl border shadow-card p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <ChevronDown className="h-5 w-5 text-primary" />
                      <h3 className="font-display font-semibold text-lg">Step-by-Step Guide</h3>
                    </div>
                    <ol className="space-y-3">
                      {selectedExercise.steps.map((step, j) => (
                        <motion.li
                          key={j}
                          initial={{ opacity: 0, x: 15 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: j * 0.06 }}
                          className="flex items-start gap-3"
                        >
                          <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                            {j + 1}
                          </span>
                          <p className="text-sm leading-relaxed pt-1">{step}</p>
                        </motion.li>
                      ))}
                    </ol>
                  </div>

                  {/* AI Detection Details */}
                  <div className="bg-card rounded-2xl border shadow-card p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Cpu className="h-5 w-5 text-accent" />
                      <h3 className="font-display font-semibold text-lg">AI Detection Details</h3>
                    </div>

                    <div className="space-y-4">
                      {/* Joints */}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Eye className="h-3.5 w-3.5" /> Joints Tracked
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedExercise.aiDetection.jointsTracked.map((joint) => (
                            <Badge key={joint} variant="outline" className="bg-accent/10 text-accent border-accent/20">
                              {joint}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Posture */}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5" /> Posture Analysis
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {selectedExercise.aiDetection.postureAnalysis}
                        </p>
                      </div>

                      {/* Rep Detection */}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                          <RotateCcw className="h-3.5 w-3.5" /> Repetition Detection
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {selectedExercise.aiDetection.repDetection}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* CTA */}
                  <Link to="/ai-trainer">
                    <Button className="w-full h-12 bg-gradient-primary text-primary-foreground text-base font-semibold rounded-xl shadow-card hover:shadow-card-hover transition-all">
                      <Dumbbell className="h-5 w-5 mr-2" />
                      Start AI Trainer — {selectedExercise.name}
                      <ArrowRight className="h-5 w-5 ml-auto" />
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
