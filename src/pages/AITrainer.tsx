import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, CameraOff, RotateCcw, Activity, CheckCircle2, AlertTriangle, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import trainerAvatar from "@/assets/trainer-avatar.png";
import squatImg from "@/assets/exercise-squat.png";
import pushupImg from "@/assets/exercise-pushup.png";
import curlImg from "@/assets/exercise-biceps-curl.png";
import lungeImg from "@/assets/exercise-lunge.png";
import jackImg from "@/assets/exercise-jumping-jack.png";
import plankImg from "@/assets/exercise-plank.png";
import { usePoseDetection, type ExerciseType } from "@/hooks/usePoseDetection";
import { useAuth } from "@/contexts/AuthContext";
import { addFirestoreDoc } from "@/hooks/useFirestore";
import { useToast } from "@/hooks/use-toast";
import { serverTimestamp } from "firebase/firestore";

const exercises: ExerciseType[] = ["Biceps Curl", "Squat", "Pushup", "Lunge", "Jumping Jack", "Plank"];

const exerciseGuidance: Record<
  ExerciseType,
  {
    image: string;
    cameraFacing: string;
    manual: string[];
    aiExpectations: string[];
  }
> = {
  Squat: {
    image: squatImg,
    cameraFacing: "Face the laptop directly (front view). Keep both shoulders visible and centered.",
    manual: [
      "Feet shoulder-width, chest up, core tight.",
      "Sit hips back and down until thighs are near parallel.",
      "Drive through heels and stand tall without rounding your back.",
    ],
    aiExpectations: [
      "Knee angle reaches squat depth and returns to near standing.",
      "Back stays stable and knees track over ankles.",
      "Rep counts only if posture score is 75% or higher.",
    ],
  },
  Pushup: {
    image: pushupImg,
    cameraFacing: "Turn to your right side toward the laptop (side view) so shoulder-hip-knee line is visible.",
    manual: [
      "Start in a straight plank with hands under shoulders.",
      "Lower chest with elbows controlled, then press back up.",
      "Keep hips aligned with shoulders and ankles.",
    ],
    aiExpectations: [
      "Elbow angle goes down and returns to full extension.",
      "Body remains in a straight line during each rep.",
      "Rep counts only if posture score is 75% or higher.",
    ],
  },
  "Biceps Curl": {
    image: curlImg,
    cameraFacing: "Face the laptop directly (front view) with elbows and wrists fully visible.",
    manual: [
      "Keep elbows close to torso with shoulders relaxed.",
      "Curl weight up with control and lower fully.",
      "Avoid body swing and momentum.",
    ],
    aiExpectations: [
      "Elbow flexes to top position and returns to extension.",
      "Elbows stay tucked; full range is required.",
      "Rep counts only if posture score is 75% or higher.",
    ],
  },
  Lunge: {
    image: lungeImg,
    cameraFacing: "Turn to your left or right side toward the laptop (side view) to show knee depth clearly.",
    manual: [
      "Step forward and lower until both knees bend well.",
      "Front knee stays above ankle; torso remains upright.",
      "Push back to standing with control.",
    ],
    aiExpectations: [
      "Lunge knee reaches depth and returns to standing.",
      "Torso remains upright and movement stays balanced.",
      "Rep counts only if posture score is 75% or higher.",
    ],
  },
  "Jumping Jack": {
    image: jackImg,
    cameraFacing: "Face the laptop directly (front view) so both arms and legs stay in frame.",
    manual: [
      "Jump feet wide while raising arms overhead.",
      "Return feet together and arms to sides.",
      "Keep rhythm steady and land softly.",
    ],
    aiExpectations: [
      "Arms and feet open enough, then close fully.",
      "Body control and range must be consistent.",
      "Rep counts only if posture score is 75% or higher.",
    ],
  },
  Plank: {
    image: plankImg,
    cameraFacing: "Turn to your right side toward the laptop (side view) for best plank-line tracking.",
    manual: [
      "Elbows under shoulders; body in one straight line.",
      "Brace core and glutes to avoid hip drop.",
      "Breathe steadily and hold without shaking hips.",
    ],
    aiExpectations: [
      "Shoulder-hip-ankle alignment remains stable.",
      "Shoulders stay stacked over elbows.",
      "Goal is time-based: hold good form until your selected target duration.",
    ],
  },
};

const formatTime = (seconds: number): string => {
  const min = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const sec = (seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
};

export default function AITrainer() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedExercise, setSelectedExercise] = useState<ExerciseType>("Squat");
  const previousCameraOnRef = useRef(false);
  const [savingWorkoutLog, setSavingWorkoutLog] = useState(false);
  const [targetReps, setTargetReps] = useState(10);
  const [targetSets, setTargetSets] = useState(3);
  const [hasLoggedCurrentTarget, setHasLoggedCurrentTarget] = useState(false);

  const {
    videoRef,
    canvasRef,
    cameraOn,
    errorMessage,
    reps,
    postureScore,
    calories,
    feedbackHistory,
    elapsedSeconds,
    distanceStatus,
    distanceHint,
    currentPhase,
    liveChecks,
    activePlankTime,
    perfectPlankTime,
    perfectPlankTimeAtTarget,
    targetPlankTime,
    plankCompleted,
    setTargetPlankTime,
    startCamera,
    stopCamera,
    resetSession,
  } = usePoseDetection(selectedExercise);

  const isPlank = selectedExercise === "Plank";
  const plankProgress = useMemo(() => {
    if (!isPlank || targetPlankTime <= 0) return 0;
    return Math.min(100, (activePlankTime / targetPlankTime) * 100);
  }, [activePlankTime, isPlank, targetPlankTime]);

  const distanceBadgeClass = useMemo(() => {
    if (distanceStatus === "good") return "bg-emerald-500/20 text-emerald-200 border border-emerald-300/30";
    if (distanceStatus === "too-close") return "bg-amber-500/20 text-amber-200 border border-amber-300/30";
    if (distanceStatus === "too-far") return "bg-orange-500/20 text-orange-200 border border-orange-300/30";
    return "bg-slate-500/20 text-slate-200 border border-slate-300/30";
  }, [distanceStatus]);

  const distanceLabel = useMemo(() => {
    if (distanceStatus === "good") return "Distance: Good";
    if (distanceStatus === "too-close") return "Distance: Too Close";
    if (distanceStatus === "too-far") return "Distance: Too Far";
    return "Distance: Adjusting";
  }, [distanceStatus]);

  const postureLabel = useMemo(() => {
    if (postureScore >= 85) return "Excellent";
    if (postureScore >= 65) return "Good";
    return "Needs Improvement";
  }, [postureScore]);

  const selectedGuidance = useMemo(() => exerciseGuidance[selectedExercise], [selectedExercise]);

  const targetTotalReps = useMemo(() => targetReps * targetSets, [targetReps, targetSets]);

  const completedSets = useMemo(() => {
    if (isPlank) {
      if (targetPlankTime <= 0) return 0;
      return Math.min(targetSets, Math.floor(elapsedSeconds / targetPlankTime));
    }
    return Math.min(targetSets, Math.floor(reps / targetReps));
  }, [elapsedSeconds, isPlank, reps, targetPlankTime, targetReps, targetSets]);

  const currentSetReps = useMemo(() => {
    if (isPlank) {
      return 0;
    }
    return reps % targetReps;
  }, [isPlank, reps, targetReps]);

  const targetReached = useMemo(() => {
    if (isPlank) {
      return completedSets >= targetSets;
    }
    return reps >= targetTotalReps;
  }, [completedSets, isPlank, reps, targetSets, targetTotalReps]);

  const targetProgress = useMemo(() => {
    if (isPlank) {
      const totalTargetSeconds = targetPlankTime * targetSets;
      if (totalTargetSeconds <= 0) return 0;
      return Math.min(100, (elapsedSeconds / totalTargetSeconds) * 100);
    }
    if (targetTotalReps <= 0) return 0;
    return Math.min(100, (reps / targetTotalReps) * 100);
  }, [elapsedSeconds, isPlank, reps, targetPlankTime, targetSets, targetTotalReps]);

  useEffect(() => {
    if (selectedExercise === "Plank") {
      setTargetSets(1);
    } else {
      setTargetSets(3);
      setTargetReps(10);
    }
    setHasLoggedCurrentTarget(false);
  }, [selectedExercise]);

  useEffect(() => {
    const justStopped = previousCameraOnRef.current && !cameraOn;
    previousCameraOnRef.current = cameraOn;

    if (!justStopped) {
      return;
    }

    const durationSeconds = Math.max(
      0,
      isPlank ? elapsedSeconds : elapsedSeconds
    );

    const hasCompletedSession =
      (isPlank && (plankCompleted || activePlankTime > 0.5)) ||
      (!isPlank && (reps > 0 || durationSeconds > 0));

    if (!hasCompletedSession || !user) {
      return;
    }

    const saveAnalysis = async () => {
      try {
        const feedback =
          postureScore >= 85 ? "excellent" : postureScore >= 65 ? "good" : "needs_improvement";
        await addFirestoreDoc("ai_workout_analysis", user.uid, {
          exercise_name: selectedExercise.toLowerCase().replace(/ /g, "_"),
          reps_detected: isPlank ? 0 : reps,
          posture_score: postureScore,
          calories_estimated: calories,
          duration_seconds: durationSeconds,
          good_plank_seconds: Number(activePlankTime.toFixed(1)),
          active_plank_seconds: Number(activePlankTime.toFixed(1)),
          perfect_plank_seconds: Number(perfectPlankTime.toFixed(1)),
          feedback,
          recorded_at: serverTimestamp(),
        });
      } catch {
        toast({
          variant: "destructive",
          title: "Session save failed",
          description: "Could not save AI analysis for this workout.",
        });
      }
    };

    void saveAnalysis();
  }, [
    activePlankTime,
    calories,
    cameraOn,
    elapsedSeconds,
    isPlank,
    plankCompleted,
    perfectPlankTime,
    postureScore,
    reps,
    selectedExercise,
    toast,
    user,
  ]);

  const toggleCamera = async () => {
    if (cameraOn) {
      stopCamera();
      return;
    }

    setHasLoggedCurrentTarget(false);
    await startCamera();
  };

  const handleResetSession = () => {
    setHasLoggedCurrentTarget(false);
    resetSession();
  };

  const saveWorkoutLog = async () => {
    if (!user || savingWorkoutLog) {
      return;
    }

    const durationSeconds = Math.max(1, elapsedSeconds);

    setSavingWorkoutLog(true);
    try {
      await addFirestoreDoc("workouts", user.uid, {
        exercise_name: selectedExercise,
        sets: isPlank ? completedSets : targetSets,
        reps: isPlank ? 0 : reps,
        duration_minutes: Number((durationSeconds / 60).toFixed(2)),
        calories_burned: Number(calories.toFixed(1)),
        workout_type: "AI Trainer",
        ai_detected: true,
        target_sets: targetSets,
        target_reps: isPlank ? 0 : targetReps,
        target_seconds: isPlank ? targetPlankTime : 0,
        completed_sets: completedSets,
        good_plank_seconds: Number(activePlankTime.toFixed(1)),
        active_plank_seconds: Number(activePlankTime.toFixed(1)),
        perfect_plank_seconds: Number(perfectPlankTime.toFixed(1)),
        timestamp: serverTimestamp(),
      });

      toast({
        title: "Workout logged",
        description: "This session is now saved in Workout Tracker.",
      });
      setHasLoggedCurrentTarget(true);
    } catch {
      toast({
        variant: "destructive",
        title: "Unable to log workout",
        description: "Please try saving this session again.",
      });
    } finally {
      setSavingWorkoutLog(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">AI Trainer</h1>
        <p className="text-muted-foreground">Real-time exercise detection and form analysis</p>
      </div>

      {/* Exercise Selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {exercises.map((ex) => (
          <button
            key={ex}
            onClick={() => setSelectedExercise(ex)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedExercise === ex
                ? "bg-gradient-primary text-primary-foreground shadow-card"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Webcam Panel - Left */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
            <p className="font-medium text-primary">AI Tracking Tips</p>
            <p className="text-muted-foreground mt-1">
              Place your laptop camera at chest height, keep your full body visible, and stand around 1.5 to 2.5 meters (5 to 8 feet) away.
            </p>
          </div>

          <div className="bg-card rounded-2xl border overflow-hidden shadow-card">
            <div className="aspect-video bg-foreground/5 relative flex items-center justify-center">
              <div className="w-full h-full bg-foreground/10 relative">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-opacity ${cameraOn ? "opacity-100" : "opacity-0"}`}
                />
                <canvas
                  ref={canvasRef}
                  className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity ${cameraOn ? "opacity-100" : "opacity-0"}`}
                />

                {cameraOn ? (
                  <>
                    {/* Overlay stats */}
                    <div className="absolute top-4 left-4 glass rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        <span className="font-medium">{selectedExercise}</span>
                      </div>
                    </div>
                    <div className="absolute top-4 right-4 glass rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Timer className="h-4 w-4 text-accent" />
                        <span className="font-medium">{formatTime(elapsedSeconds)}</span>
                      </div>
                    </div>

                    <div
                      className={`absolute top-4 left-1/2 -translate-x-1/2 rounded-lg px-3 py-1.5 text-xs font-medium backdrop-blur-sm ${distanceBadgeClass}`}
                    >
                      {distanceLabel}
                    </div>

                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 glass rounded-lg px-3 py-1.5 text-xs text-center max-w-[80%]">
                      {distanceHint}
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 text-center space-y-3 flex flex-col items-center justify-center bg-foreground/5">
                    <Camera className="h-12 w-12 text-muted-foreground mx-auto" />
                    <p className="text-muted-foreground">Enable your camera to start AI detection</p>
                    <p className="text-xs text-muted-foreground/90 px-8 max-w-md">
                      Stand about 1.5 to 2.5 meters (5 to 8 feet) from your laptop so your full body stays in frame.
                    </p>
                    {errorMessage && <p className="text-sm text-destructive px-6">{errorMessage}</p>}
                    {errorMessage && (
                      <Button size="sm" onClick={startCamera} className="bg-gradient-primary text-primary-foreground">
                        Retry Camera
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 flex items-center justify-between border-t">
              <p className="text-sm text-muted-foreground">
                {cameraOn
                  ? "AI is analyzing your movements in real time"
                  : "Camera off - keep 1.5 to 2.5 meters (5 to 8 feet) distance"}
              </p>
              <div className="flex gap-2">
                <Button
                  variant={cameraOn ? "destructive" : "default"}
                  size="sm"
                  onClick={toggleCamera}
                  className={!cameraOn ? "bg-gradient-primary text-primary-foreground" : ""}
                >
                  {cameraOn ? <CameraOff className="h-4 w-4 mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                  {cameraOn ? "Stop" : "Start Camera"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleResetSession}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Reset
                </Button>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4">
            {isPlank ? (
              <>
                <div className="bg-card rounded-xl border p-4 shadow-card text-center">
                  <p className="text-sm text-muted-foreground mb-1">Plank Timer</p>
                  <p className="text-2xl font-display font-bold text-primary">
                    {elapsedSeconds}s / {targetPlankTime}s
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">Good: {activePlankTime.toFixed(1)}s | Perfect: {perfectPlankTime.toFixed(1)}s</p>
                  {perfectPlankTimeAtTarget > 0 && (
                    <p className="text-[11px] text-emerald-300 mt-1">Perfect Recorded @ Target: {perfectPlankTimeAtTarget.toFixed(1)}s</p>
                  )}
                </div>
                <div className="bg-card rounded-xl border p-4 shadow-card text-center">
                  <p className="text-sm text-muted-foreground mb-1">Progress</p>
                  <p className="text-3xl font-display font-bold">{Math.round(plankProgress)}%</p>
                  <Progress value={plankProgress} className="h-2 mt-2" />
                </div>
                <div className="bg-card rounded-xl border p-4 shadow-card text-center">
                  <p className="text-sm text-muted-foreground mb-1">Calories</p>
                  <p className="text-3xl font-display font-bold text-accent">{calories}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {plankCompleted ? "Goal reached! Keep holding" : "Time-based burn"}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-card rounded-xl border p-4 shadow-card text-center">
                  <p className="text-sm text-muted-foreground mb-1">Reps</p>
                  <p className="text-3xl font-display font-bold text-primary">{reps}</p>
                </div>
                <div className="bg-card rounded-xl border p-4 shadow-card text-center">
                  <p className="text-sm text-muted-foreground mb-1">Posture Score</p>
                  <p className="text-3xl font-display font-bold">{postureScore}%</p>
                </div>
                <div className="bg-card rounded-xl border p-4 shadow-card text-center">
                  <p className="text-sm text-muted-foreground mb-1">Calories</p>
                  <p className="text-3xl font-display font-bold text-accent">{calories}</p>
                </div>
              </>
            )}
          </div>

          <div className="bg-card rounded-xl border p-4 shadow-card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">Target & Workout Log</p>
              <span className={`text-xs px-2 py-1 rounded-full border ${targetReached ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" : "text-amber-300 border-amber-500/40 bg-amber-500/10"}`}>
                {targetReached ? "Target Reached" : "Target In Progress"}
              </span>
            </div>

            {isPlank ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground mr-1">Target Time:</p>
                  {[30, 60, 120].map((seconds) => (
                    <button
                      key={seconds}
                      onClick={() => setTargetPlankTime(seconds)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        targetPlankTime === seconds
                          ? "bg-gradient-primary text-primary-foreground shadow-card"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {seconds}s
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground mr-1">Target Sets:</p>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      onClick={() => {
                        setTargetSets(value);
                        setHasLoggedCurrentTarget(false);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        targetSets === value
                          ? "bg-gradient-primary text-primary-foreground shadow-card"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Done: {activePlankTime.toFixed(1)}s | Set Progress: {completedSets}/{targetSets} | Perfect: {perfectPlankTime.toFixed(1)}s
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-muted-foreground">Target Reps:</p>
                    {[8, 10, 12, 15, 20].map((value) => (
                      <button
                        key={value}
                        onClick={() => {
                          setTargetReps(value);
                          setHasLoggedCurrentTarget(false);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          targetReps === value
                            ? "bg-gradient-primary text-primary-foreground shadow-card"
                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-muted-foreground">Target Sets:</p>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        onClick={() => {
                          setTargetSets(value);
                          setHasLoggedCurrentTarget(false);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          targetSets === value
                            ? "bg-gradient-primary text-primary-foreground shadow-card"
                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Target: {targetSets} x {targetReps} = {targetTotalReps} reps | Done: {reps} reps | Sets: {completedSets}/{targetSets} | Current Set: {currentSetReps}/{targetReps}
                </p>
              </div>
            )}

            <Progress value={targetProgress} className="h-2" />

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {hasLoggedCurrentTarget
                  ? "Workout already logged for this target."
                  : targetReached
                    ? "Target complete. You can now log this workout."
                    : "You can still log this workout even if target is not complete."}
              </p>
              <Button
                size="sm"
                className="bg-gradient-primary text-primary-foreground"
                onClick={saveWorkoutLog}
                disabled={savingWorkoutLog || hasLoggedCurrentTarget}
              >
                {savingWorkoutLog ? "Saving..." : hasLoggedCurrentTarget ? "Logged" : "Log Workout"}
              </Button>
            </div>
          </div>

        </div>

        {/* Trainer Panel - Right */}
        <div className="lg:col-span-2 space-y-4">
          {/* Trainer Card */}
          <div className="bg-card rounded-2xl border shadow-card overflow-hidden">
            <div className="bg-gradient-primary p-4 text-center">
              <img src={trainerAvatar} alt="AI Trainer" className="h-28 mx-auto object-contain mb-2" />
              <p className="font-display font-semibold text-primary-foreground">Coach AI</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="glass rounded-xl p-3">
                <p className="text-sm font-medium mb-1">Current Exercise</p>
                <p className="text-lg font-display font-bold text-primary">{selectedExercise}</p>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-muted-foreground">Posture Quality</span>
                  <span className="font-medium">{postureScore}% ({postureLabel})</span>
                </div>
                <Progress value={postureScore} className="h-2" />
              </div>
            </div>
          </div>

          {/* Feedback Panel */}
          <div className="bg-card rounded-2xl border p-4 shadow-card">
            <h3 className="font-display font-semibold mb-3">Live Feedback</h3>
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {feedbackHistory.map((msg, i) => (
                <motion.div
                  key={`${msg.text}-${i}`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex items-start gap-2 p-2.5 rounded-lg text-sm ${
                    msg.type === "success"
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-accent/10 border border-accent/25"
                  }`}
                >
                  {msg.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                  )}
                  <span>{msg.text}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 bg-card rounded-2xl border shadow-card overflow-hidden">
          <div className="grid md:grid-cols-5">
            <div className="md:col-span-2 border-b md:border-b-0 md:border-r bg-muted/20">
              <img
                src={selectedGuidance.image}
                alt={`${selectedExercise} reference`}
                className="w-full h-full min-h-[300px] md:min-h-[360px] object-contain object-center p-2 md:p-3"
              />
            </div>

            <div className="md:col-span-3 p-4 md:p-5 space-y-5">
              <div>
                <h3 className="font-display font-semibold mb-2">Section 1: Exercise Manual ({selectedExercise})</h3>
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground mb-3">
                  <span className="font-medium text-foreground">Camera Direction:</span> {selectedGuidance.cameraFacing}
                </div>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {selectedGuidance.manual.map((step, idx) => (
                    <li key={idx}>{idx + 1}. {step}</li>
                  ))}
                </ul>
              </div>

              <div className="h-px bg-border" />

              <div>
                <h3 className="font-display font-semibold mb-2">
                  {isPlank ? "Section 2: What System Requires To Complete Goal" : "Section 2: What System Requires To Count Rep"}
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {isPlank
                    ? "The timer progresses only while posture is valid."
                    : "The rep is counted only if these conditions are satisfied."}
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground mb-3">
                  {selectedGuidance.aiExpectations.map((rule, idx) => (
                    <li key={idx}>{idx + 1}. {rule}</li>
                  ))}
                </ul>
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  Accuracy tiers: 95-100 = Perfect, 80-94 = Good move, 75-79 = Counted with correction, below 75 = Not counted.
                </div>

                <div className="mt-4 rounded-xl border bg-secondary/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Live AI Checks</p>
                    <p className="text-xs text-muted-foreground">Phase: {currentPhase}</p>
                  </div>
                  {liveChecks.length > 0 ? (
                    <div className="space-y-2">
                      {liveChecks.map((check, idx) => (
                        <div key={`${check.label}-${idx}`} className="rounded-lg border bg-background/60 px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium">{check.label}</p>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                check.pass
                                  ? "text-emerald-700 border-emerald-300 bg-emerald-100"
                                  : "text-rose-700 border-rose-300 bg-rose-100"
                              }`}
                            >
                              {check.pass ? "PASS" : "FAIL"}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">Current: {check.current}</p>
                          <p className="text-[11px] text-muted-foreground">Target: {check.threshold}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Start camera to see real-time threshold checks.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
