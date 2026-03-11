import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Pose,
  POSE_CONNECTIONS,
  type NormalizedLandmark,
  type NormalizedLandmarkList,
  type Results,
} from "@mediapipe/pose";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";

export type ExerciseType = "Biceps Curl" | "Squat" | "Pushup" | "Lunge" | "Jumping Jack" | "Plank";
export type DistanceStatus = "good" | "too-close" | "too-far" | "adjusting";

type FeedbackType = "success" | "warning";

export interface LiveFeedback {
  text: string;
  type: FeedbackType;
}

export interface LiveMetricCheck {
  label: string;
  current: string;
  threshold: string;
  pass: boolean;
}

interface UsePoseDetectionResult {
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  cameraOn: boolean;
  errorMessage: string | null;
  reps: number;
  postureScore: number;
  calories: number;
  feedbackHistory: LiveFeedback[];
  elapsedSeconds: number;
  distanceStatus: DistanceStatus;
  distanceHint: string;
  currentPhase: string;
  liveChecks: LiveMetricCheck[];
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  resetSession: () => void;
}

const LANDMARKS = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const scoreFromRange = (value: number, target: number, spread: number): number => {
  const delta = Math.abs(value - target);
  return clamp(100 - (delta / spread) * 100, 0, 100);
};

const scoreInRange = (value: number, min: number, max: number, tolerance: number): number => {
  if (value >= min && value <= max) return 100;
  const delta = value < min ? min - value : value - max;
  return clamp(100 - (delta / tolerance) * 100, 0, 100);
};

const smoothValue = (prev: number, next: number, alpha = 0.3): number => prev * (1 - alpha) + next * alpha;

const estimateFrameBrightness = (ctx: CanvasRenderingContext2D, width: number, height: number): number => {
  const sampleW = Math.max(48, Math.floor(width / 8));
  const sampleH = Math.max(36, Math.floor(height / 8));
  const imageData = ctx.getImageData(0, 0, sampleW, sampleH).data;

  let sum = 0;
  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  const pixels = imageData.length / 4;
  return pixels > 0 ? sum / pixels : 255;
};

const visibilityOkay = (lms: NormalizedLandmarkList, indices: number[], min = 0.45): boolean => {
  return indices.every((index) => (lms[index]?.visibility ?? 0) >= min);
};

const getDistanceStatus = (landmarks: NormalizedLandmarkList): { status: DistanceStatus; hint: string } => {
  const tracked = [
    landmarks[LANDMARKS.leftShoulder],
    landmarks[LANDMARKS.rightShoulder],
    landmarks[LANDMARKS.leftHip],
    landmarks[LANDMARKS.rightHip],
    landmarks[LANDMARKS.leftAnkle],
    landmarks[LANDMARKS.rightAnkle],
  ];

  if (tracked.some((lm) => !lm || (lm.visibility ?? 0) < 0.3)) {
    return {
      status: "adjusting",
      hint: "Adjust position so shoulders, hips, and ankles are visible.",
    };
  }

  const ys = tracked.map((lm) => lm.y);
  const bodyHeight = Math.max(...ys) - Math.min(...ys);

  if (bodyHeight > 0.86) {
    return { status: "too-close", hint: "You are too close. Step back slightly." };
  }

  if (bodyHeight < 0.46) {
    return { status: "too-far", hint: "You are too far. Move a bit closer." };
  }

  return { status: "good", hint: "Distance is ideal for tracking." };
};

const cloneLandmarks = (landmarks: NormalizedLandmarkList): NormalizedLandmarkList => {
  return landmarks.map((lm) => ({ ...lm })) as NormalizedLandmarkList;
};

const averageLandmarks = (history: NormalizedLandmarkList[]): NormalizedLandmarkList => {
  const frameCount = history.length;
  const pointsCount = history[0]?.length ?? 0;
  const averaged: NormalizedLandmark[] = [];

  for (let i = 0; i < pointsCount; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    let visibility = 0;

    for (let f = 0; f < frameCount; f++) {
      const lm = history[f][i];
      x += lm.x;
      y += lm.y;
      z += lm.z ?? 0;
      visibility += lm.visibility ?? 0;
    }

    averaged.push({
      x: x / frameCount,
      y: y / frameCount,
      z: z / frameCount,
      visibility: visibility / frameCount,
    });
  }

  return averaged as NormalizedLandmarkList;
};

const applyDeadband = (
  previous: NormalizedLandmarkList | null,
  next: NormalizedLandmarkList,
  epsilon = 0.0035
): NormalizedLandmarkList => {
  if (!previous || previous.length !== next.length) return next;

  const stabilized = next.map((lm, i) => {
    const prev = previous[i];
    return {
      ...lm,
      x: Math.abs(lm.x - prev.x) < epsilon ? prev.x : lm.x,
      y: Math.abs(lm.y - prev.y) < epsilon ? prev.y : lm.y,
      z: Math.abs((lm.z ?? 0) - (prev.z ?? 0)) < epsilon ? prev.z : lm.z,
    };
  });

  return stabilized as NormalizedLandmarkList;
};

const CAMERA_CONSTRAINTS: MediaStreamConstraints[] = [
  {
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: "user",
      frameRate: { ideal: 24, min: 15 },
    },
  },
  {
    video: {
      width: { ideal: 480 },
      height: { ideal: 360 },
      facingMode: "user",
      frameRate: { ideal: 20, min: 12 },
    },
  },
  {
    video: {
      width: { ideal: 320 },
      height: { ideal: 240 },
      facingMode: "user",
      frameRate: { ideal: 18, min: 10 },
    },
  },
  { video: { facingMode: "user" } },
  { video: true },
];

const angleFromThreePoints = (a: { x: number; y: number; z?: number }, b: { x: number; y: number; z?: number }, c: { x: number; y: number; z?: number }): number => {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };

  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const abMag = Math.sqrt(ab.x * ab.x + ab.y * ab.y + ab.z * ab.z);
  const cbMag = Math.sqrt(cb.x * cb.x + cb.y * cb.y + cb.z * cb.z);

  if (abMag === 0 || cbMag === 0) return 0;

  const cosine = clamp(dot / (abMag * cbMag), -1, 1);
  return toDegrees(Math.acos(cosine));
};

export function usePoseDetection(selectedExercise: ExerciseType): UsePoseDetectionResult {
  // Temporary diagnostic toggle: allow half squat (descending -> standing) to count one rep.
  // Set to false after validating rep counter pipeline.
  const ENABLE_PARTIAL_SQUAT_DIAGNOSTIC = true;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const poseRef = useRef<Pose | null>(null);
  const rafRef = useRef<number | null>(null);
  const loopActiveRef = useRef(false);
  const processingFrameRef = useRef(false);
  const squatPhaseRef = useRef<"standing" | "descending" | "bottom" | "ascending">("standing");
  const squatRepLockRef = useRef(true);
  const squatCandidateStateRef = useRef<"standing" | "descending" | "bottom" | "ascending" | null>(null);
  const squatCandidateFramesRef = useRef(0);
  const pushupPhaseRef = useRef<"up" | "descending" | "bottom" | "rising">("up");
  const curlPhaseRef = useRef<"down" | "curling" | "top" | "lowering">("down");
  const lungePhaseRef = useRef<"standing" | "descending" | "bottom" | "rising">("standing");
  const jackPhaseRef = useRef<"closed" | "open">("closed");
  const startTimeRef = useRef<number | null>(null);
  const frameCounterRef = useRef(0);
  const lastProcessedTsRef = useRef(0);
  const repLastCountTsRef = useRef(0);
  const invalidFrameStreakRef = useRef(0);
  const landmarkHistoryRef = useRef<NormalizedLandmarkList[]>([]);
  const lastValidLandmarksRef = useRef<NormalizedLandmarkList | null>(null);
  const previousStabilizedLandmarksRef = useRef<NormalizedLandmarkList | null>(null);
  const lowLightRef = useRef(false);
  const smoothedAnglesRef = useRef({
    knee: 170,
    elbow: 170,
    back: 170,
    plank: 170,
  });
  const lastFeedbackTsRef = useRef(0);
  const lastFeedbackTextRef = useRef("");

  const [cameraOn, setCameraOn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reps, setReps] = useState(0);
  const [postureScore, setPostureScore] = useState(0);
  const [feedbackHistory, setFeedbackHistory] = useState<LiveFeedback[]>([
    { text: "Start camera to begin real-time AI coaching.", type: "success" },
  ]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceStatus, setDistanceStatus] = useState<DistanceStatus>("adjusting");
  const [distanceHint, setDistanceHint] = useState("Stand 1.5 to 2.5m (5 to 8ft) from camera.");
  const [currentPhase, setCurrentPhase] = useState("idle");
  const [liveChecks, setLiveChecks] = useState<LiveMetricCheck[]>([]);

  const calories = useMemo(() => Number((reps * 0.3).toFixed(1)), [reps]);

  const pushFeedback = useCallback((feedback: LiveFeedback) => {
    const now = Date.now();
    const tooSoon = now - lastFeedbackTsRef.current < 3000;
    if (tooSoon) return;

    lastFeedbackTsRef.current = now;
    lastFeedbackTextRef.current = feedback.text;

    setFeedbackHistory((prev) => [feedback, ...prev].slice(0, 6));
  }, []);

  const resetSession = useCallback(() => {
    squatPhaseRef.current = "standing";
    squatRepLockRef.current = true;
    squatCandidateStateRef.current = null;
    squatCandidateFramesRef.current = 0;
    pushupPhaseRef.current = "up";
    curlPhaseRef.current = "down";
    lungePhaseRef.current = "standing";
    jackPhaseRef.current = "closed";
    startTimeRef.current = cameraOn ? performance.now() : null;
    repLastCountTsRef.current = 0;
    landmarkHistoryRef.current = [];
    lastValidLandmarksRef.current = null;
    previousStabilizedLandmarksRef.current = null;
    invalidFrameStreakRef.current = 0;
    smoothedAnglesRef.current = { knee: 170, elbow: 170, back: 170, plank: 170 };
    setReps(0);
    setPostureScore(0);
    setElapsedSeconds(0);
    setDistanceStatus("adjusting");
    setDistanceHint("Stand 1.5 to 2.5m (5 to 8ft) from camera.");
    setFeedbackHistory([{ text: `Tracking reset for ${selectedExercise}.`, type: "success" }]);
  }, [cameraOn, selectedExercise]);

  const stopCamera = useCallback(() => {
    loopActiveRef.current = false;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    setCameraOn(false);
    processingFrameRef.current = false;
  }, []);

  const evaluateExercise = useCallback(
    (landmarks: NormalizedLandmarkList): { feedback: LiveFeedback; posture: number } => {
      const commitChecks = (phase: string, checks: LiveMetricCheck[]) => {
        setCurrentPhase(phase);
        setLiveChecks(checks);
      };

      const countRepByAccuracy = (posture: number, exerciseName: string): void => {
        if (posture >= 75) {
          setReps((prev) => prev + 1);
          if (posture >= 95) {
            pushFeedback({ text: `Perfect level ${exerciseName} rep. Outstanding form!`, type: "success" });
          } else if (posture >= 80) {
            pushFeedback({ text: `Good move. ${exerciseName} rep counted.`, type: "success" });
          } else {
            pushFeedback({ text: `Rep counted. Keep refining your ${exerciseName} form.`, type: "success" });
          }
        } else {
          pushFeedback({ text: `Rep not counted (${posture}%). Aim for at least 75% form accuracy.`, type: "warning" });
        }
      };

      const lShoulder = landmarks[LANDMARKS.leftShoulder];
      const rShoulder = landmarks[LANDMARKS.rightShoulder];
      const lElbow = landmarks[LANDMARKS.leftElbow];
      const rElbow = landmarks[LANDMARKS.rightElbow];
      const lWrist = landmarks[LANDMARKS.leftWrist];
      const rWrist = landmarks[LANDMARKS.rightWrist];
      const lHip = landmarks[LANDMARKS.leftHip];
      const rHip = landmarks[LANDMARKS.rightHip];
      const lKnee = landmarks[LANDMARKS.leftKnee];
      const rKnee = landmarks[LANDMARKS.rightKnee];
      const lAnkle = landmarks[LANDMARKS.leftAnkle];
      const rAnkle = landmarks[LANDMARKS.rightAnkle];

      const leftKneeAngleRaw = angleFromThreePoints(lHip, lKnee, lAnkle);
      const rightKneeAngleRaw = angleFromThreePoints(rHip, rKnee, rAnkle);
      const leftElbowAngleRaw = angleFromThreePoints(lShoulder, lElbow, lWrist);
      const rightElbowAngleRaw = angleFromThreePoints(rShoulder, rElbow, rWrist);

      const leftLegVis = (lHip.visibility ?? 0) + (lKnee.visibility ?? 0) + (lAnkle.visibility ?? 0);
      const rightLegVis = (rHip.visibility ?? 0) + (rKnee.visibility ?? 0) + (rAnkle.visibility ?? 0);
      const leftArmVis = (lShoulder.visibility ?? 0) + (lElbow.visibility ?? 0) + (lWrist.visibility ?? 0);
      const rightArmVis = (rShoulder.visibility ?? 0) + (rElbow.visibility ?? 0) + (rWrist.visibility ?? 0);

      const kneeRaw =
        Math.abs(leftLegVis - rightLegVis) > 0.3
          ? leftLegVis > rightLegVis
            ? leftKneeAngleRaw
            : rightKneeAngleRaw
          : (leftKneeAngleRaw + rightKneeAngleRaw) / 2;

      const elbowRaw =
        Math.abs(leftArmVis - rightArmVis) > 0.3
          ? leftArmVis > rightArmVis
            ? leftElbowAngleRaw
            : rightElbowAngleRaw
          : (leftElbowAngleRaw + rightElbowAngleRaw) / 2;

      const backRaw =
        (angleFromThreePoints(lShoulder, lHip, lKnee) + angleFromThreePoints(rShoulder, rHip, rKnee)) / 2;

      smoothedAnglesRef.current.knee = smoothValue(smoothedAnglesRef.current.knee, kneeRaw);
      smoothedAnglesRef.current.elbow = smoothValue(smoothedAnglesRef.current.elbow, elbowRaw);
      smoothedAnglesRef.current.back = smoothValue(smoothedAnglesRef.current.back, backRaw);

      const avgKneeAngle = smoothedAnglesRef.current.knee;
      const avgElbowAngle = smoothedAnglesRef.current.elbow;
      const backAngle = smoothedAnglesRef.current.back;

      const kneeAlignmentDelta =
        (Math.abs(lKnee.x - lAnkle.x) + Math.abs(rKnee.x - rAnkle.x)) / 2;

      if (selectedExercise === "Squat") {
        const depthScore = scoreInRange(avgKneeAngle, 85, 125, 50);
        const backScore = scoreFromRange(backAngle, 155, 55);
        const kneeAlignmentScore = clamp(100 - (kneeAlignmentDelta / 0.24) * 100, 0, 100);
        const posture = Math.round(depthScore * 0.45 + backScore * 0.35 + kneeAlignmentScore * 0.2);

        // Squat transitions use tolerant thresholds and require 2 stable frames.
        // This reduces jitter and ensures reps count only for bottom -> ascending -> standing.
        const currentSquatState = squatPhaseRef.current;
        let nextCandidateState: typeof currentSquatState | null = null;

        if (currentSquatState === "standing") {
          if (avgKneeAngle < 140) nextCandidateState = "descending";
        } else if (currentSquatState === "descending") {
          if (avgKneeAngle < 100) nextCandidateState = "bottom";
          else if (avgKneeAngle > 160) nextCandidateState = "standing";
        } else if (currentSquatState === "bottom") {
          if (avgKneeAngle > 130) nextCandidateState = "ascending";
        } else if (currentSquatState === "ascending") {
          if (avgKneeAngle > 160) nextCandidateState = "standing";
          else if (avgKneeAngle < 100) nextCandidateState = "bottom";
        }

        if (nextCandidateState && nextCandidateState !== currentSquatState) {
          if (squatCandidateStateRef.current === nextCandidateState) {
            squatCandidateFramesRef.current += 1;
          } else {
            squatCandidateStateRef.current = nextCandidateState;
            squatCandidateFramesRef.current = 1;
          }

          if (squatCandidateFramesRef.current >= 2) {
            const prevState = squatPhaseRef.current;
            squatPhaseRef.current = nextCandidateState;
            squatCandidateStateRef.current = null;
            squatCandidateFramesRef.current = 0;

            if (squatPhaseRef.current === "bottom") {
              squatRepLockRef.current = false;
            }

            if (ENABLE_PARTIAL_SQUAT_DIAGNOSTIC && squatPhaseRef.current === "descending") {
              // Open lock for the current cycle so a partial return can be counted once in diagnostic mode.
              squatRepLockRef.current = false;
            }

            const isFullCycleRep = prevState === "ascending" && squatPhaseRef.current === "standing";
            const hasStandingDescendingTransition =
              (prevState === "standing" && squatPhaseRef.current === "descending") ||
              (prevState === "descending" && squatPhaseRef.current === "standing");
            const isDiagnosticPartialRep =
              ENABLE_PARTIAL_SQUAT_DIAGNOSTIC &&
              hasStandingDescendingTransition &&
              squatPhaseRef.current === "standing";

            if (
              (isFullCycleRep || isDiagnosticPartialRep) &&
              !squatRepLockRef.current &&
              Date.now() - repLastCountTsRef.current > 900
            ) {
              repLastCountTsRef.current = Date.now();
              squatRepLockRef.current = true;
              // Squat rep counts by full cycle; diagnostic mode can also count partial cycle.
              setReps((prev) => prev + 1);
              if (isDiagnosticPartialRep) {
                pushFeedback({ text: "Diagnostic mode: partial squat rep counted.", type: "warning" });
              } else if (posture >= 95) {
                pushFeedback({ text: "Perfect level squat rep. Outstanding form!", type: "success" });
              } else if (posture >= 80) {
                pushFeedback({ text: "Good move. Squat rep counted.", type: "success" });
              } else {
                pushFeedback({ text: "Squat rep counted. Keep refining your form.", type: "success" });
              }
            }
          }
        } else {
          squatCandidateStateRef.current = null;
          squatCandidateFramesRef.current = 0;
        }

        const debounceReady = Date.now() - repLastCountTsRef.current > 900;
        commitChecks(`squat:${squatPhaseRef.current}`, [
          {
            label: "Debug angle",
            current: `${avgKneeAngle.toFixed(1)}°`,
            threshold: "live value",
            pass: true,
          },
          {
            label: "Debug state",
            current: squatPhaseRef.current,
            threshold: "standing/descending/bottom/ascending",
            pass: true,
          },
          {
            label: "Knee angle (depth)",
            current: `${avgKneeAngle.toFixed(1)}°`,
            threshold: "< 100° for bottom",
            pass: avgKneeAngle < 100,
          },
          {
            label: "Standing extension",
            current: `${avgKneeAngle.toFixed(1)}°`,
            threshold: "> 160°",
            pass: avgKneeAngle > 160,
          },
          {
            label: "Back angle",
            current: `${backAngle.toFixed(1)}°`,
            threshold: "> 145°",
            pass: backAngle > 145,
          },
          {
            label: "Posture score",
            current: `${posture}%`,
            threshold: ">= 75%",
            pass: posture >= 75,
          },
          {
            label: "Debounce",
            current: debounceReady ? "ready" : "waiting",
            threshold: "> 900ms",
            pass: debounceReady,
          },
          {
            label: "Rep lock",
            current: squatRepLockRef.current ? "locked" : "open",
            threshold: "open at bottom",
            pass: !squatRepLockRef.current,
          },
          {
            label: "Counting mode",
            current: ENABLE_PARTIAL_SQUAT_DIAGNOSTIC ? "full + partial (diagnostic)" : "full only",
            threshold: "temporary debug",
            pass: true,
          },
        ]);

        if (backScore < 50) return { feedback: { text: "Keep your back straighter during the squat.", type: "warning" }, posture };
        if (depthScore < 50) return { feedback: { text: "Lower your hips slightly for a deeper squat.", type: "warning" }, posture };
        if (kneeAlignmentScore < 50) return { feedback: { text: "Keep knees aligned over your ankles.", type: "warning" }, posture };
        return { feedback: { text: "Form looks good. Complete full squat range to count a rep.", type: "success" }, posture };
      }

      if (selectedExercise === "Pushup") {
        const plankLineRaw =
          (angleFromThreePoints(lShoulder, lHip, lAnkle) + angleFromThreePoints(rShoulder, rHip, rAnkle)) / 2;
        smoothedAnglesRef.current.plank = smoothValue(smoothedAnglesRef.current.plank, plankLineRaw);
        const plankLineAngle = smoothedAnglesRef.current.plank;
        const lineScore = scoreInRange(plankLineAngle, 150, 180, 35);
        const elbowDepthScore = scoreInRange(avgElbowAngle, 85, 120, 50);
        const posture = Math.round(lineScore * 0.6 + elbowDepthScore * 0.4);

        if (pushupPhaseRef.current === "up" && avgElbowAngle < 160) {
          pushupPhaseRef.current = "descending";
        }
        if (pushupPhaseRef.current === "descending" && avgElbowAngle <= 125) {
          pushupPhaseRef.current = "bottom";
        }
        if (pushupPhaseRef.current === "bottom" && avgElbowAngle > 140) {
          pushupPhaseRef.current = "rising";
        }
        if (pushupPhaseRef.current === "rising" && avgElbowAngle > 165 && Date.now() - repLastCountTsRef.current > 900) {
          pushupPhaseRef.current = "up";
          repLastCountTsRef.current = Date.now();
          countRepByAccuracy(posture, "pushup");
        }

        const debounceReady = Date.now() - repLastCountTsRef.current > 900;
        commitChecks(`pushup:${pushupPhaseRef.current}`, [
          {
            label: "Elbow depth",
            current: `${avgElbowAngle.toFixed(1)}°`,
            threshold: "85°-125°",
            pass: avgElbowAngle >= 85 && avgElbowAngle <= 125,
          },
          {
            label: "Lockout extension",
            current: `${avgElbowAngle.toFixed(1)}°`,
            threshold: "> 165°",
            pass: avgElbowAngle > 165,
          },
          {
            label: "Plank line",
            current: `${plankLineAngle.toFixed(1)}°`,
            threshold: "150°-180°",
            pass: plankLineAngle >= 150 && plankLineAngle <= 180,
          },
          {
            label: "Posture score",
            current: `${posture}%`,
            threshold: ">= 75%",
            pass: posture >= 75,
          },
          {
            label: "Debounce",
            current: debounceReady ? "ready" : "waiting",
            threshold: "> 900ms",
            pass: debounceReady,
          },
        ]);

        if (lineScore < 65) return { feedback: { text: "Keep your back straight in a plank line.", type: "warning" }, posture };
        if (elbowDepthScore < 55) return { feedback: { text: "Go slightly deeper for a complete pushup.", type: "warning" }, posture };
        return { feedback: { text: "Form looks good. Complete full pushup range to count a rep.", type: "success" }, posture };
      }

      if (selectedExercise === "Biceps Curl") {
        const armPathDelta = (Math.abs(lShoulder.x - lElbow.x) + Math.abs(rShoulder.x - rElbow.x)) / 2;
        const elbowTuckScore = clamp(100 - (armPathDelta / 0.14) * 100, 0, 100);
        const rangeScore = scoreInRange(avgElbowAngle, 60, 95, 55);
        const posture = Math.round(elbowTuckScore * 0.55 + rangeScore * 0.45);

        if (curlPhaseRef.current === "down" && avgElbowAngle < 160) {
          curlPhaseRef.current = "curling";
        }
        if (curlPhaseRef.current === "curling" && avgElbowAngle <= 95) {
          curlPhaseRef.current = "top";
        }
        if (curlPhaseRef.current === "top" && avgElbowAngle > 110) {
          curlPhaseRef.current = "lowering";
        }
        if (curlPhaseRef.current === "lowering" && avgElbowAngle > 165 && Date.now() - repLastCountTsRef.current > 900) {
          curlPhaseRef.current = "down";
          repLastCountTsRef.current = Date.now();
          countRepByAccuracy(posture, "curl");
        }

        const debounceReady = Date.now() - repLastCountTsRef.current > 900;
        commitChecks(`curl:${curlPhaseRef.current}`, [
          {
            label: "Curl top range",
            current: `${avgElbowAngle.toFixed(1)}°`,
            threshold: "60°-95°",
            pass: avgElbowAngle >= 60 && avgElbowAngle <= 95,
          },
          {
            label: "Full extension",
            current: `${avgElbowAngle.toFixed(1)}°`,
            threshold: "> 165°",
            pass: avgElbowAngle > 165,
          },
          {
            label: "Elbow tuck score",
            current: `${elbowTuckScore.toFixed(1)}%`,
            threshold: ">= 60%",
            pass: elbowTuckScore >= 60,
          },
          {
            label: "Posture score",
            current: `${posture}%`,
            threshold: ">= 75%",
            pass: posture >= 75,
          },
          {
            label: "Debounce",
            current: debounceReady ? "ready" : "waiting",
            threshold: "> 900ms",
            pass: debounceReady,
          },
        ]);

        if (elbowTuckScore < 60) return { feedback: { text: "Keep your elbows tucked near your torso.", type: "warning" }, posture };
        if (rangeScore < 60) return { feedback: { text: "Use full curl range: squeeze up, extend down.", type: "warning" }, posture };
        return { feedback: { text: "Form looks good. Complete full curl range to count a rep.", type: "success" }, posture };
      }

      if (selectedExercise === "Lunge") {
        const leftLungeDepth = scoreInRange(leftKneeAngleRaw, 75, 110, 35);
        const rightLungeDepth = scoreInRange(rightKneeAngleRaw, 75, 110, 35);
        const depthScore = Math.max(leftLungeDepth, rightLungeDepth);
        const trunkScore = scoreFromRange(backAngle, 165, 35);
        const symmetryScore = clamp(100 - (Math.abs(leftKneeAngleRaw - rightKneeAngleRaw) / 70) * 100, 0, 100);
        const lungeKnee = Math.min(leftKneeAngleRaw, rightKneeAngleRaw);
        const posture = Math.round(depthScore * 0.45 + trunkScore * 0.35 + symmetryScore * 0.2);

        if (lungePhaseRef.current === "standing" && lungeKnee < 160) {
          lungePhaseRef.current = "descending";
        }
        if (lungePhaseRef.current === "descending" && lungeKnee <= 125) {
          lungePhaseRef.current = "bottom";
        }
        if (lungePhaseRef.current === "bottom" && lungeKnee > 140) {
          lungePhaseRef.current = "rising";
        }
        if (lungePhaseRef.current === "rising" && lungeKnee > 165 && Date.now() - repLastCountTsRef.current > 900) {
          lungePhaseRef.current = "standing";
          repLastCountTsRef.current = Date.now();
          countRepByAccuracy(posture, "lunge");
        }

        const debounceReady = Date.now() - repLastCountTsRef.current > 900;
        commitChecks(`lunge:${lungePhaseRef.current}`, [
          {
            label: "Lunge knee depth",
            current: `${lungeKnee.toFixed(1)}°`,
            threshold: "75°-125°",
            pass: lungeKnee >= 75 && lungeKnee <= 125,
          },
          {
            label: "Return to stand",
            current: `${lungeKnee.toFixed(1)}°`,
            threshold: "> 165°",
            pass: lungeKnee > 165,
          },
          {
            label: "Torso/back angle",
            current: `${backAngle.toFixed(1)}°`,
            threshold: "> 145°",
            pass: backAngle > 145,
          },
          {
            label: "Posture score",
            current: `${posture}%`,
            threshold: ">= 75%",
            pass: posture >= 75,
          },
          {
            label: "Debounce",
            current: debounceReady ? "ready" : "waiting",
            threshold: "> 900ms",
            pass: debounceReady,
          },
        ]);

        if (depthScore < 60) return { feedback: { text: "Lower more for a stronger lunge depth.", type: "warning" }, posture };
        if (trunkScore < 60) return { feedback: { text: "Keep your torso upright during lunges.", type: "warning" }, posture };
        return { feedback: { text: "Form looks good. Complete full lunge range to count a rep.", type: "success" }, posture };
      }

      if (selectedExercise === "Jumping Jack") {
        const wristSpread = Math.abs(lWrist.x - rWrist.x);
        const ankleSpread = Math.abs(lAnkle.x - rAnkle.x);
        const armOpenScore = scoreInRange(wristSpread, 0.5, 0.85, 0.2);
        const legOpenScore = scoreInRange(ankleSpread, 0.42, 0.8, 0.2);
        const trunkScore = scoreFromRange(backAngle, 170, 40);
        const posture = Math.round(armOpenScore * 0.4 + legOpenScore * 0.4 + trunkScore * 0.2);

        if (jackPhaseRef.current === "closed" && wristSpread > 0.45 && ankleSpread > 0.35) {
          jackPhaseRef.current = "open";
        }
        if (jackPhaseRef.current === "open" && wristSpread < 0.32 && ankleSpread < 0.25 && Date.now() - repLastCountTsRef.current > 900) {
          jackPhaseRef.current = "closed";
          repLastCountTsRef.current = Date.now();
          countRepByAccuracy(posture, "jumping jack");
        }

        const debounceReady = Date.now() - repLastCountTsRef.current > 900;
        commitChecks(`jumping-jack:${jackPhaseRef.current}`, [
          {
            label: "Arm spread",
            current: wristSpread.toFixed(3),
            threshold: "> 0.45 open",
            pass: wristSpread > 0.45,
          },
          {
            label: "Leg spread",
            current: ankleSpread.toFixed(3),
            threshold: "> 0.35 open",
            pass: ankleSpread > 0.35,
          },
          {
            label: "Close position",
            current: `arm ${wristSpread.toFixed(3)} / leg ${ankleSpread.toFixed(3)}`,
            threshold: "arm < 0.32 and leg < 0.25",
            pass: wristSpread < 0.32 && ankleSpread < 0.25,
          },
          {
            label: "Posture score",
            current: `${posture}%`,
            threshold: ">= 75%",
            pass: posture >= 75,
          },
          {
            label: "Debounce",
            current: debounceReady ? "ready" : "waiting",
            threshold: "> 900ms",
            pass: debounceReady,
          },
        ]);

        if (armOpenScore < 60) return { feedback: { text: "Open your arms wider for full jack range.", type: "warning" }, posture };
        if (legOpenScore < 60) return { feedback: { text: "Jump your feet wider for full jack range.", type: "warning" }, posture };
        return { feedback: { text: "Form looks good. Fully open and close to count each rep.", type: "success" }, posture };
      }

      if (selectedExercise === "Plank") {
        const plankLineRaw =
          (angleFromThreePoints(lShoulder, lHip, lAnkle) + angleFromThreePoints(rShoulder, rHip, rAnkle)) / 2;
        smoothedAnglesRef.current.plank = smoothValue(smoothedAnglesRef.current.plank, plankLineRaw);
        const plankLineAngle = smoothedAnglesRef.current.plank;
        const lineScore = scoreInRange(plankLineAngle, 155, 180, 25);
        const shoulderStackScore = clamp(100 - (Math.abs(lShoulder.x - lElbow.x) + Math.abs(rShoulder.x - rElbow.x)) * 160, 0, 100);
        const posture = Math.round(lineScore * 0.7 + shoulderStackScore * 0.3);

        if (posture >= 75 && Date.now() - repLastCountTsRef.current > 3000) {
          repLastCountTsRef.current = Date.now();
          countRepByAccuracy(posture, "plank hold");
        }

        const debounceReady = Date.now() - repLastCountTsRef.current > 3000;
        commitChecks("plank:hold", [
          {
            label: "Plank line angle",
            current: `${plankLineAngle.toFixed(1)}°`,
            threshold: "155°-180°",
            pass: plankLineAngle >= 155 && plankLineAngle <= 180,
          },
          {
            label: "Shoulder stack score",
            current: `${shoulderStackScore.toFixed(1)}%`,
            threshold: ">= 60%",
            pass: shoulderStackScore >= 60,
          },
          {
            label: "Posture score",
            current: `${posture}%`,
            threshold: ">= 75%",
            pass: posture >= 75,
          },
          {
            label: "Hold timer",
            current: debounceReady ? "3s reached" : "building",
            threshold: ">= 3 seconds",
            pass: debounceReady,
          },
        ]);

        if (lineScore < 65) return { feedback: { text: "Keep your hips aligned with shoulders and ankles.", type: "warning" }, posture };
        if (shoulderStackScore < 60) return { feedback: { text: "Stack your shoulders over elbows for better plank support.", type: "warning" }, posture };
        return { feedback: { text: "Plank form looks good. Hold steady for 3 seconds to get credit.", type: "success" }, posture };
      }

      const genericPosture = Math.round(scoreFromRange(backAngle, 165, 45));
      commitChecks("tracking", []);
      return {
        feedback: { text: "Tracking posture. Maintain steady controlled movement.", type: "success" },
        posture: genericPosture,
      };
    },
    [pushFeedback, selectedExercise]
  );

  const onPoseResults = useCallback(
    (results: Results) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, width, height);

      let activeLandmarks: NormalizedLandmarkList | null = null;

      if (results.poseLandmarks && results.poseLandmarks.length > 0) {
        invalidFrameStreakRef.current = 0;
        const cloned = cloneLandmarks(results.poseLandmarks);
        landmarkHistoryRef.current.push(cloned);
        if (landmarkHistoryRef.current.length > 5) {
          landmarkHistoryRef.current.shift();
        }

        const averaged = averageLandmarks(landmarkHistoryRef.current);
        const stabilized = applyDeadband(previousStabilizedLandmarksRef.current, averaged);
        previousStabilizedLandmarksRef.current = cloneLandmarks(stabilized);
        lastValidLandmarksRef.current = cloneLandmarks(stabilized);
        activeLandmarks = stabilized;
      } else if (lastValidLandmarksRef.current && invalidFrameStreakRef.current < 8) {
        invalidFrameStreakRef.current += 1;
        activeLandmarks = cloneLandmarks(lastValidLandmarksRef.current);
      } else {
        invalidFrameStreakRef.current += 1;
        return;
      }

      const distance = getDistanceStatus(activeLandmarks);
      setDistanceStatus(distance.status);
      setDistanceHint(distance.hint);

      drawConnectors(ctx, activeLandmarks, POSE_CONNECTIONS, { color: "#22c55e", lineWidth: 3 });
      drawLandmarks(ctx, activeLandmarks, { color: "#14b8a6", lineWidth: 2, radius: 3 });

      const needed = [
        LANDMARKS.leftShoulder,
        LANDMARKS.rightShoulder,
        LANDMARKS.leftElbow,
        LANDMARKS.rightElbow,
        LANDMARKS.leftWrist,
        LANDMARKS.rightWrist,
        LANDMARKS.leftHip,
        LANDMARKS.rightHip,
        LANDMARKS.leftKnee,
        LANDMARKS.rightKnee,
        LANDMARKS.leftAnkle,
        LANDMARKS.rightAnkle,
      ];

      const visibilityThreshold = lowLightRef.current ? 0.3 : 0.45;
      if (!visibilityOkay(activeLandmarks, needed, visibilityThreshold)) {
        pushFeedback({
          text: "Move back so your full body is visible (ideal distance: 1.5-2.5m / 5-8ft).",
          type: "warning",
        });
        return;
      }

      const { posture, feedback } = evaluateExercise(activeLandmarks);
      setPostureScore(posture);
      pushFeedback(feedback);
    },
    [evaluateExercise, pushFeedback]
  );

  const startDetectionLoop = useCallback(() => {
    const pose = poseRef.current;
    const video = videoRef.current;
    if (!pose || !video) return;

    loopActiveRef.current = true;

    const loop = async () => {
      if (!loopActiveRef.current || !videoRef.current || !poseRef.current) return;

      const now = performance.now();
      const targetIntervalMs = 1000 / 18;
      if (now - lastProcessedTsRef.current < targetIntervalMs) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      if (!processingFrameRef.current) {
        processingFrameRef.current = true;
        lastProcessedTsRef.current = now;
        try {
          const video = videoRef.current;
          if (!video) return;

          if (!processingCanvasRef.current) {
            processingCanvasRef.current = document.createElement("canvas");
          }

          const processingCanvas = processingCanvasRef.current;
          const width = video.videoWidth || 640;
          const height = video.videoHeight || 480;
          processingCanvas.width = width;
          processingCanvas.height = height;

          const pctx = processingCanvas.getContext("2d");
          if (!pctx) return;

          frameCounterRef.current += 1;

          pctx.filter = "none";
          pctx.drawImage(video, 0, 0, width, height);

          if (frameCounterRef.current % 12 === 0) {
            const brightness = estimateFrameBrightness(pctx, width, height);
            const isLowLight = brightness < 60;
            if (isLowLight !== lowLightRef.current) {
              lowLightRef.current = isLowLight;
              if (isLowLight) {
                pushFeedback({ text: "Low light detected. Turn on a light for better tracking.", type: "warning" });
                poseRef.current.setOptions({ minDetectionConfidence: 0.35, minTrackingConfidence: 0.35 });
              } else {
                pushFeedback({ text: "Lighting improved. Tracking accuracy should be better now.", type: "success" });
                poseRef.current.setOptions({ minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
              }
            }
          }

          if (lowLightRef.current) {
            pctx.filter = "brightness(1.35) contrast(1.2)";
            pctx.drawImage(video, 0, 0, width, height);
            pctx.filter = "none";
          }

          await poseRef.current.send({ image: processingCanvas });
        } catch {
          setErrorMessage("Unable to process camera frames. Please retry.");
        } finally {
          processingFrameRef.current = false;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const ensurePose = useCallback(() => {
    if (poseRef.current) return;

    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults(onPoseResults);
    poseRef.current = pose;
  }, [onPoseResults]);

  useEffect(() => {
    if (!poseRef.current) return;
    // Keep MediaPipe callback in sync with latest selected exercise/state.
    poseRef.current.onResults(onPoseResults);
  }, [onPoseResults]);

  const startCamera = useCallback(async () => {
    setErrorMessage(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Camera is not supported in this browser.");
      return;
    }

    try {
      let stream: MediaStream | null = null;
      for (const constraints of CAMERA_CONSTRAINTS) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch {
          stream = null;
        }
      }

      if (!stream) {
        throw new Error("camera-unavailable");
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        setErrorMessage("Video element is unavailable.");
        return;
      }

      video.srcObject = stream;
      await video.play();

      ensurePose();
      setCameraOn(true);
      startTimeRef.current = performance.now();
      setElapsedSeconds(0);
      lastProcessedTsRef.current = 0;
      frameCounterRef.current = 0;
      startDetectionLoop();
      pushFeedback({ text: "Camera started. AI detection is live.", type: "success" });
    } catch {
      setErrorMessage("Camera access is required for AI workout detection. Please allow camera permissions.");
      stopCamera();
    }
  }, [ensurePose, pushFeedback, startDetectionLoop, stopCamera]);

  useEffect(() => {
    if (!cameraOn) return;

    const timer = window.setInterval(() => {
      if (!startTimeRef.current) return;
      const seconds = Math.floor((performance.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(seconds);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cameraOn]);

  useEffect(() => {
    resetSession();
  }, [resetSession, selectedExercise]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (poseRef.current) {
        poseRef.current.close();
        poseRef.current = null;
      }
    };
  }, [stopCamera]);

  return {
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
    startCamera,
    stopCamera,
    resetSession,
  };
}
