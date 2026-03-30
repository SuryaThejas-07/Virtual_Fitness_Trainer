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
  activePlankTime: number;
  perfectPlankTime: number;
  perfectPlankTimeAtTarget: number;
  totalElapsedTime: number;
  targetPlankTime: number;
  plankCompleted: boolean;
  setTargetPlankTime: (seconds: number) => void;
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

const smoothValue = (prev: number, next: number, alpha = 0.5): number => prev * (1 - alpha) + next * alpha;

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

const preferVisiblePoint = (
  primary: { x: number; y: number; z?: number; visibility?: number },
  fallback: { x: number; y: number; z?: number; visibility?: number },
  min = 0.3
): { x: number; y: number; z?: number; visibility?: number } => {
  return (primary.visibility ?? 0) >= min ? primary : fallback;
};

const hasExerciseVisibility = (exercise: ExerciseType, lms: NormalizedLandmarkList, min = 0.35): boolean => {
  const torso = [
    LANDMARKS.leftShoulder,
    LANDMARKS.rightShoulder,
    LANDMARKS.leftHip,
    LANDMARKS.rightHip,
  ];

  const leftChain = [
    LANDMARKS.leftShoulder,
    LANDMARKS.leftElbow,
    LANDMARKS.leftWrist,
    LANDMARKS.leftHip,
    LANDMARKS.leftKnee,
    LANDMARKS.leftAnkle,
  ];

  const rightChain = [
    LANDMARKS.rightShoulder,
    LANDMARKS.rightElbow,
    LANDMARKS.rightWrist,
    LANDMARKS.rightHip,
    LANDMARKS.rightKnee,
    LANDMARKS.rightAnkle,
  ];

  const hasTorso = visibilityOkay(lms, torso, min);
  const hasLeft = visibilityOkay(lms, leftChain, min);
  const hasRight = visibilityOkay(lms, rightChain, min);
  const leftUpper = visibilityOkay(lms, [LANDMARKS.leftShoulder, LANDMARKS.leftElbow, LANDMARKS.leftWrist], min);
  const rightUpper = visibilityOkay(lms, [LANDMARKS.rightShoulder, LANDMARKS.rightElbow, LANDMARKS.rightWrist], min);
  const leftNoAnkle = visibilityOkay(
    lms,
    [LANDMARKS.leftShoulder, LANDMARKS.leftElbow, LANDMARKS.leftWrist, LANDMARKS.leftHip, LANDMARKS.leftKnee],
    min
  );
  const rightNoAnkle = visibilityOkay(
    lms,
    [LANDMARKS.rightShoulder, LANDMARKS.rightElbow, LANDMARKS.rightWrist, LANDMARKS.rightHip, LANDMARKS.rightKnee],
    min
  );
  const hasUpperBody = hasTorso && (leftUpper || rightUpper);

  if (exercise === "Biceps Curl") {
    // Curls are upper-body dominant; avoid blocking reps when legs are outside frame.
    return hasUpperBody;
  }

  if (exercise === "Pushup" || exercise === "Plank") {
    // Floor exercises can still be tracked if knees are visible while ankles drift out of frame.
    return hasTorso && (hasLeft || hasRight || leftNoAnkle || rightNoAnkle);
  }

  if (exercise === "Jumping Jack") {
    // Jumping jacks need both sides visible for open/close symmetry checks.
    return hasTorso && hasLeft && hasRight;
  }

  // Other exercises can be tracked from either dominant side.
  return hasTorso && (hasLeft || hasRight);
};

const getDistanceStatus = (
  exercise: ExerciseType,
  landmarks: NormalizedLandmarkList
): { status: DistanceStatus; hint: string } => {
  const tracked =
    exercise === "Biceps Curl"
      ? [
          landmarks[LANDMARKS.leftShoulder],
          landmarks[LANDMARKS.rightShoulder],
          landmarks[LANDMARKS.leftHip],
          landmarks[LANDMARKS.rightHip],
          landmarks[LANDMARKS.leftWrist],
          landmarks[LANDMARKS.rightWrist],
        ]
      : exercise === "Pushup" || exercise === "Plank"
        ? [
            landmarks[LANDMARKS.leftShoulder],
            landmarks[LANDMARKS.rightShoulder],
            landmarks[LANDMARKS.leftHip],
            landmarks[LANDMARKS.rightHip],
            landmarks[LANDMARKS.leftKnee],
            landmarks[LANDMARKS.rightKnee],
          ]
        : [
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
      hint:
        exercise === "Biceps Curl"
          ? "Adjust so shoulders, hips, and wrists are visible."
          : exercise === "Pushup" || exercise === "Plank"
            ? "Adjust so shoulders, hips, and knees are visible."
          : "Adjust position so shoulders, hips, and ankles are visible.",
    };
  }

  const ys = tracked.map((lm) => lm.y);
  const bodyHeight = Math.max(...ys) - Math.min(...ys);

  const tooCloseThreshold =
    exercise === "Biceps Curl" ? 0.76 : exercise === "Pushup" || exercise === "Plank" ? 0.9 : 0.86;
  const tooFarThreshold =
    exercise === "Biceps Curl" ? 0.32 : exercise === "Pushup" || exercise === "Plank" ? 0.34 : 0.46;

  if (bodyHeight > tooCloseThreshold) {
    return { status: "too-close", hint: "You are too close. Step back slightly." };
  }

  if (bodyHeight < tooFarThreshold) {
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

const POSE_ASSET_BASE_URLS = [
  "/mediapipe/pose",
  "https://cdn.jsdelivr.net/npm/@mediapipe/pose",
  "https://unpkg.com/@mediapipe/pose",
] as const;

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

const getCameraErrorMessage = (error: unknown): string => {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera permission was denied. Please allow camera access and try again.";
    }
    if (error.name === "NotReadableError") {
      return "Camera is already in use by another app. Close other apps using the camera and retry.";
    }
    if (error.name === "OverconstrainedError") {
      return "Your device could not satisfy the camera settings. Retrying with default camera settings may help.";
    }
    if (error.name === "SecurityError") {
      return "Camera access is blocked by browser security settings.";
    }
    if (error.name === "AbortError") {
      return "Camera startup was interrupted. Please try again.";
    }
  }

  if (error instanceof Error) {
    if (error.message.startsWith("pose-model-load-failed:")) {
      const detail = error.message.replace("pose-model-load-failed:", "").trim();
      return detail
        ? `Camera opened but AI model initialization failed (${detail}).`
        : "Camera opened but AI model initialization failed.";
    }

    if (error.message === "camera-unavailable") {
      return "No working camera was found on this device/browser. Try another browser or device.";
    }
    if (error.message === "video-playback-failed") {
      return "Camera opened but video playback failed in this browser. Please open this site in Chrome or Safari and retry.";
    }
    if (error.message === "video-metadata-timeout") {
      return "Camera opened but video stream did not initialize in time. Please retry.";
    }

    if (error.name) {
      return `Camera startup failed (${error.name}). Please retry.`;
    }
  }

  return "Camera could not be started. Check permissions and try again.";
};

const waitForVideoMetadata = (video: HTMLVideoElement, timeoutMs = 2500): Promise<void> => {
  if (video.readyState >= 1) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("video-metadata-timeout"));
    };

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("video-metadata-timeout"));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
  });
};

export function usePoseDetection(selectedExercise: ExerciseType): UsePoseDetectionResult {
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
  const squatDepthReachedRef = useRef(false);
  const squatCandidateStateRef = useRef<"standing" | "descending" | "bottom" | "ascending" | null>(null);
  const squatCandidateFramesRef = useRef(0);
  const pushupPhaseRef = useRef<"up" | "descending" | "bottom" | "rising">("up");
  const pushupDepthReachedRef = useRef(false);
  const pushupCandidateStateRef = useRef<"up" | "descending" | "bottom" | "rising" | null>(null);
  const pushupCandidateFramesRef = useRef(0);
  const curlPhaseRef = useRef<"down" | "curling" | "top" | "lowering">("down");
  const curlTopReachedRef = useRef(false);
  const curlContractionReachedRef = useRef(false);
  const curlAngleWindowRef = useRef<number[]>([]);
  const curlCandidateStateRef = useRef<"down" | "curling" | "top" | "lowering" | null>(null);
  const curlCandidateFramesRef = useRef(0);
  const lungePhaseRef = useRef<"standing" | "descending" | "bottom" | "rising">("standing");
  const lungeDepthReachedRef = useRef(false);
  const lungeCandidateStateRef = useRef<"standing" | "descending" | "bottom" | "rising" | null>(null);
  const lungeCandidateFramesRef = useRef(0);
  const jackPhaseRef = useRef<"closed" | "open">("closed");
  const jackOpenReachedRef = useRef(false);
  const jackCandidateStateRef = useRef<"closed" | "open" | null>(null);
  const jackCandidateFramesRef = useRef(0);
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
  const plankAccumulatedMsRef = useRef(0);
  const plankPerfectAccumulatedMsRef = useRef(0);
  const plankLastTickTsRef = useRef<number | null>(null);
  const plankRunningRef = useRef(false);
  const plankCompletionAnnouncedRef = useRef(false);
  const plankMilestoneCountRef = useRef(0);

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
  const [activePlankTime, setActivePlankTime] = useState(0);
  const [perfectPlankTime, setPerfectPlankTime] = useState(0);
  const [perfectPlankTimeAtTarget, setPerfectPlankTimeAtTarget] = useState(0);
  const [totalElapsedTime, setTotalElapsedTime] = useState(0);
  const [targetPlankTime, setTargetPlankTimeState] = useState(60);
  const [plankCompleted, setPlankCompleted] = useState(false);

  const calories = useMemo(() => {
    if (selectedExercise === "Plank") {
      const hybridSeconds = activePlankTime * 0.7 + totalElapsedTime * 0.3;
      return Number((hybridSeconds * 0.05).toFixed(1));
    }
    return Number((reps * 0.3).toFixed(1));
  }, [activePlankTime, reps, selectedExercise, totalElapsedTime]);

  const setTargetPlankTime = useCallback((seconds: number) => {
    const safeSeconds = clamp(Math.round(seconds), 10, 600);
    setTargetPlankTimeState(safeSeconds);
  }, []);

  const playCompletionBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);

      gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.16, audioCtx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.26);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.27);
      oscillator.onended = () => {
        void audioCtx.close();
      };
    } catch {
      // Ignore beep errors to avoid interrupting workout tracking.
    }
  }, []);

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
    squatDepthReachedRef.current = false;
    squatCandidateStateRef.current = null;
    squatCandidateFramesRef.current = 0;
    pushupPhaseRef.current = "up";
    pushupDepthReachedRef.current = false;
    pushupCandidateStateRef.current = null;
    pushupCandidateFramesRef.current = 0;
    curlPhaseRef.current = "down";
    curlTopReachedRef.current = false;
    curlContractionReachedRef.current = false;
    curlAngleWindowRef.current = [];
    curlCandidateStateRef.current = null;
    curlCandidateFramesRef.current = 0;
    lungePhaseRef.current = "standing";
    lungeDepthReachedRef.current = false;
    lungeCandidateStateRef.current = null;
    lungeCandidateFramesRef.current = 0;
    jackPhaseRef.current = "closed";
    jackOpenReachedRef.current = false;
    jackCandidateStateRef.current = null;
    jackCandidateFramesRef.current = 0;
    startTimeRef.current = cameraOn ? performance.now() : null;
    repLastCountTsRef.current = 0;
    landmarkHistoryRef.current = [];
    lastValidLandmarksRef.current = null;
    previousStabilizedLandmarksRef.current = null;
    invalidFrameStreakRef.current = 0;
    smoothedAnglesRef.current = { knee: 170, elbow: 170, back: 170, plank: 170 };
    plankAccumulatedMsRef.current = 0;
    plankPerfectAccumulatedMsRef.current = 0;
    plankLastTickTsRef.current = null;
    plankRunningRef.current = false;
    plankCompletionAnnouncedRef.current = false;
    plankMilestoneCountRef.current = 0;
    setReps(0);
    setPostureScore(0);
    setElapsedSeconds(0);
    setTotalElapsedTime(0);
    setActivePlankTime(0);
    setPerfectPlankTime(0);
    setPerfectPlankTimeAtTarget(0);
    setPlankCompleted(false);
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
    plankRunningRef.current = false;
    plankLastTickTsRef.current = null;
  }, []);

  const evaluateExercise = useCallback(
    (landmarks: NormalizedLandmarkList): { feedback: LiveFeedback; posture: number } => {
      const commitChecks = (phase: string, checks: LiveMetricCheck[]) => {
        setCurrentPhase(phase);
        setLiveChecks(checks);
      };

      const countRepByAccuracy = (posture: number, exerciseName: string): void => {
        // Safety guard: plank is strictly time-based and must never increment reps.
        if (selectedExercise === "Plank") {
          return;
        }

        setReps((prev) => {
          const next = prev + 1;
          console.debug("[PoseDebug] Rep count updated", {
            exercise: selectedExercise,
            exerciseName,
            posture,
            previousReps: prev,
            nextReps: next,
          });
          return next;
        });

        if (posture >= 95) {
          pushFeedback({ text: `Perfect level ${exerciseName} rep. Outstanding form!`, type: "success" });
        } else if (posture >= 80) {
          pushFeedback({ text: `Good move. ${exerciseName} rep counted.`, type: "success" });
        } else {
          pushFeedback({ text: `Rep counted. Form is a bit off (${posture}%). Keep improving.`, type: "warning" });
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

      console.debug("[PoseDebug] Joint angles", {
        exercise: selectedExercise,
        kneeRaw,
        elbowRaw,
        avgKneeAngle,
        avgElbowAngle,
        backAngle,
      });

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
          else if (avgKneeAngle > 155) nextCandidateState = "standing";
        } else if (currentSquatState === "bottom") {
          if (avgKneeAngle > 130) nextCandidateState = "ascending";
        } else if (currentSquatState === "ascending") {
          if (avgKneeAngle > 155) nextCandidateState = "standing";
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
              squatDepthReachedRef.current = true;
            }
          }
        } else {
          squatCandidateStateRef.current = null;
          squatCandidateFramesRef.current = 0;
        }

        // Stricter squat depth gate: only count deep squats.
        if (avgKneeAngle <= 110) {
          squatDepthReachedRef.current = true;
        }

        if (
          squatDepthReachedRef.current &&
          avgKneeAngle >= 155 &&
          Date.now() - repLastCountTsRef.current > 400
        ) {
          console.debug("[PoseDebug] Squat rep trigger", {
            phase: squatPhaseRef.current,
            avgKneeAngle,
            squatDepthReached: squatDepthReachedRef.current,
            debounceMs: Date.now() - repLastCountTsRef.current,
          });
          repLastCountTsRef.current = Date.now();
          squatDepthReachedRef.current = false;
          countRepByAccuracy(posture, "squat");
        }

        squatRepLockRef.current = !squatDepthReachedRef.current;

        const debounceReady = Date.now() - repLastCountTsRef.current > 400;
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
            threshold: ">= 155°",
            pass: avgKneeAngle >= 155,
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
            threshold: "> 400ms",
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
            current: "full cycle",
            threshold: "depth then full stand",
            pass: true,
          },
        ]);

        if (backScore < 50) return { feedback: { text: "Keep your back straighter during the squat.", type: "warning" }, posture };
        if (depthScore < 50) return { feedback: { text: "Lower your hips slightly for a deeper squat.", type: "warning" }, posture };
        if (kneeAlignmentScore < 50) return { feedback: { text: "Keep knees aligned over your ankles.", type: "warning" }, posture };
        return { feedback: { text: "Form looks good. Complete full squat range to count a rep.", type: "success" }, posture };
      }

      if (selectedExercise === "Pushup") {
        const leftFootPoint = preferVisiblePoint(lAnkle, lKnee);
        const rightFootPoint = preferVisiblePoint(rAnkle, rKnee);
        const plankLineRaw =
          (angleFromThreePoints(lShoulder, lHip, leftFootPoint) + angleFromThreePoints(rShoulder, rHip, rightFootPoint)) / 2;
        smoothedAnglesRef.current.plank = smoothValue(smoothedAnglesRef.current.plank, plankLineRaw);
        const plankLineAngle = smoothedAnglesRef.current.plank;
        const lineScore = scoreInRange(plankLineAngle, 150, 180, 35);
        const elbowDepthScore = scoreInRange(avgElbowAngle, 85, 120, 50);
        const posture = Math.round(lineScore * 0.6 + elbowDepthScore * 0.4);

        const currentPushState = pushupPhaseRef.current;
        let nextPushCandidate: typeof currentPushState | null = null;
        if (currentPushState === "up") {
          if (avgElbowAngle < 155) nextPushCandidate = "descending";
        } else if (currentPushState === "descending") {
          if (avgElbowAngle <= 120) nextPushCandidate = "bottom";
          else if (avgElbowAngle > 160) nextPushCandidate = "up";
        } else if (currentPushState === "bottom") {
          if (avgElbowAngle > 135) nextPushCandidate = "rising";
        } else if (currentPushState === "rising") {
          if (avgElbowAngle > 160) nextPushCandidate = "up";
          else if (avgElbowAngle < 120) nextPushCandidate = "bottom";
        }

        if (nextPushCandidate && nextPushCandidate !== currentPushState) {
          if (pushupCandidateStateRef.current === nextPushCandidate) {
            pushupCandidateFramesRef.current += 1;
          } else {
            pushupCandidateStateRef.current = nextPushCandidate;
            pushupCandidateFramesRef.current = 1;
          }

          if (pushupCandidateFramesRef.current >= 2) {
            const prevPushState = pushupPhaseRef.current;
            pushupPhaseRef.current = nextPushCandidate;
            pushupCandidateStateRef.current = null;
            pushupCandidateFramesRef.current = 0;

            if (pushupPhaseRef.current === "bottom") {
              pushupDepthReachedRef.current = true;
            }
          }
        } else {
          pushupCandidateStateRef.current = null;
          pushupCandidateFramesRef.current = 0;
        }

        if (avgElbowAngle <= 125) {
          pushupDepthReachedRef.current = true;
        }

        if (
          pushupDepthReachedRef.current &&
          avgElbowAngle >= 155 &&
          Date.now() - repLastCountTsRef.current > 400
        ) {
          console.debug("[PoseDebug] Pushup rep trigger", {
            phase: pushupPhaseRef.current,
            avgElbowAngle,
            pushupDepthReached: pushupDepthReachedRef.current,
            debounceMs: Date.now() - repLastCountTsRef.current,
          });
          repLastCountTsRef.current = Date.now();
          pushupDepthReachedRef.current = false;
          countRepByAccuracy(posture, "pushup");
        }

        const debounceReady = Date.now() - repLastCountTsRef.current > 400;
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
            threshold: ">= 155°",
            pass: avgElbowAngle >= 155,
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
            threshold: "> 400ms",
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
        const rangeScore = scoreInRange(avgElbowAngle, 70, 125, 70);
        const posture = Math.round(elbowTuckScore * 0.55 + rangeScore * 0.45);
        const curlMotionAngle = elbowRaw;

        const boundedCurlAngle = clamp(curlMotionAngle, 45, 175);
        curlAngleWindowRef.current.push(boundedCurlAngle);
        if (curlAngleWindowRef.current.length > 75) {
          curlAngleWindowRef.current.shift();
        }

        const sortedWindow = [...curlAngleWindowRef.current].sort((a, b) => a - b);
        const sampleCount = sortedWindow.length;
        const p10 = sampleCount > 0 ? sortedWindow[Math.floor((sampleCount - 1) * 0.1)] : boundedCurlAngle;
        const p90 = sampleCount > 0 ? sortedWindow[Math.floor((sampleCount - 1) * 0.9)] : boundedCurlAngle;
        const observedCurlRange = p90 - p10;
        const adaptiveCurlTop = clamp(p10 + 12, 95, 130);
        const adaptiveCurlBottom = clamp(p90 - 10, 135, 170);

        const currentCurlState = curlPhaseRef.current;
        let nextCurlCandidate: typeof currentCurlState | null = null;
        if (currentCurlState === "down") {
          if (avgElbowAngle < 155) nextCurlCandidate = "curling";
        } else if (currentCurlState === "curling") {
          if (avgElbowAngle <= 110) nextCurlCandidate = "top";
          else if (avgElbowAngle > 155) nextCurlCandidate = "down";
        } else if (currentCurlState === "top") {
          if (avgElbowAngle > 112) nextCurlCandidate = "lowering";
        } else if (currentCurlState === "lowering") {
          if (avgElbowAngle > 155) nextCurlCandidate = "down";
          else if (avgElbowAngle < 100) nextCurlCandidate = "top";
        }

        if (nextCurlCandidate && nextCurlCandidate !== currentCurlState) {
          if (curlCandidateStateRef.current === nextCurlCandidate) {
            curlCandidateFramesRef.current += 1;
          } else {
            curlCandidateStateRef.current = nextCurlCandidate;
            curlCandidateFramesRef.current = 1;
          }

          if (curlCandidateFramesRef.current >= 2) {
            const prevCurlState = curlPhaseRef.current;
            curlPhaseRef.current = nextCurlCandidate;
            curlCandidateStateRef.current = null;
            curlCandidateFramesRef.current = 0;

            if (curlPhaseRef.current === "top") {
              curlTopReachedRef.current = true;
            }
          }
        } else {
          curlCandidateStateRef.current = null;
          curlCandidateFramesRef.current = 0;
        }

        // Require a meaningful contraction before permitting a curl rep.
        if (avgElbowAngle <= 120) {
          curlContractionReachedRef.current = true;
        }

        if (curlMotionAngle <= adaptiveCurlTop) {
          curlTopReachedRef.current = true;
        }

        if (
          curlTopReachedRef.current &&
          curlContractionReachedRef.current &&
          curlMotionAngle >= adaptiveCurlBottom - 5 &&
          Date.now() - repLastCountTsRef.current > 400
        ) {
          console.debug("[PoseDebug] Curl rep trigger", {
            phase: curlPhaseRef.current,
            curlMotionAngle,
            adaptiveCurlTop,
            adaptiveCurlBottom,
            curlTopReached: curlTopReachedRef.current,
            curlContractionReached: curlContractionReachedRef.current,
            observedCurlRange,
            debounceMs: Date.now() - repLastCountTsRef.current,
          });
          repLastCountTsRef.current = Date.now();
          curlTopReachedRef.current = false;
          curlContractionReachedRef.current = false;
          countRepByAccuracy(posture, "curl");
        }

        const debounceReady = Date.now() - repLastCountTsRef.current > 400;
        commitChecks(`curl:${curlPhaseRef.current}`, [
          {
            label: "Curl top range",
            current: `${avgElbowAngle.toFixed(1)}°`,
            threshold: `<= ${adaptiveCurlTop.toFixed(1)}° (adaptive)`,
            pass: curlMotionAngle <= adaptiveCurlTop,
          },
          {
            label: "Full extension",
            current: `${avgElbowAngle.toFixed(1)}°`,
            threshold: `>= ${(adaptiveCurlBottom - 5).toFixed(1)}° (adaptive - tolerance)`,
            pass: curlMotionAngle >= adaptiveCurlBottom - 5,
          },
          {
            label: "Full contraction",
            current: `${avgElbowAngle.toFixed(1)}°`,
            threshold: "<= 120°",
            pass: curlContractionReachedRef.current,
          },
          {
            label: "Observed ROM",
            current: `${observedCurlRange.toFixed(1)}°`,
            threshold: ">= 20°",
            pass: observedCurlRange >= 20,
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
            threshold: "> 400ms",
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

        const currentLungeState = lungePhaseRef.current;
        let nextLungeCandidate: typeof currentLungeState | null = null;
        if (currentLungeState === "standing") {
          if (lungeKnee < 160) nextLungeCandidate = "descending";
        } else if (currentLungeState === "descending") {
          if (lungeKnee <= 135) nextLungeCandidate = "bottom";
          else if (lungeKnee > 170) nextLungeCandidate = "standing";
        } else if (currentLungeState === "bottom") {
          if (lungeKnee > 145) nextLungeCandidate = "rising";
        } else if (currentLungeState === "rising") {
          if (lungeKnee > 166) nextLungeCandidate = "standing";
          else if (lungeKnee < 135) nextLungeCandidate = "bottom";
        }

        if (nextLungeCandidate && nextLungeCandidate !== currentLungeState) {
          if (lungeCandidateStateRef.current === nextLungeCandidate) {
            lungeCandidateFramesRef.current += 1;
          } else {
            lungeCandidateStateRef.current = nextLungeCandidate;
            lungeCandidateFramesRef.current = 1;
          }

          if (lungeCandidateFramesRef.current >= 2) {
            const prevLungeState = lungePhaseRef.current;
            lungePhaseRef.current = nextLungeCandidate;
            lungeCandidateStateRef.current = null;
            lungeCandidateFramesRef.current = 0;

            if (lungePhaseRef.current === "bottom") {
              lungeDepthReachedRef.current = true;
            }
          }
        } else {
          lungeCandidateStateRef.current = null;
          lungeCandidateFramesRef.current = 0;
        }

        if (lungeKnee <= 145) {
          lungeDepthReachedRef.current = true;
        }

        if (
          lungeDepthReachedRef.current &&
          lungeKnee >= 150 &&
          Date.now() - repLastCountTsRef.current > 400
        ) {
          console.debug("[PoseDebug] Lunge rep trigger", {
            phase: lungePhaseRef.current,
            lungeKnee,
            lungeDepthReached: lungeDepthReachedRef.current,
            debounceMs: Date.now() - repLastCountTsRef.current,
          });
          repLastCountTsRef.current = Date.now();
          lungeDepthReachedRef.current = false;
          countRepByAccuracy(posture, "lunge");
        }

        const debounceReady = Date.now() - repLastCountTsRef.current > 400;
        commitChecks(`lunge:${lungePhaseRef.current}`, [
          {
            label: "Lunge knee depth",
            current: `${lungeKnee.toFixed(1)}°`,
            threshold: "75°-145°",
            pass: lungeKnee >= 75 && lungeKnee <= 145,
          },
          {
            label: "Return to stand",
            current: `${lungeKnee.toFixed(1)}°`,
            threshold: ">= 150°",
            pass: lungeKnee >= 150,
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
            threshold: "> 400ms",
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

        const currentJackState = jackPhaseRef.current;
        let nextJackCandidate: typeof currentJackState | null = null;
        if (currentJackState === "closed") {
          if (wristSpread > 0.45 && ankleSpread > 0.35) nextJackCandidate = "open";
        } else if (currentJackState === "open") {
          if (wristSpread < 0.28 && ankleSpread < 0.22) nextJackCandidate = "closed";
        }

        if (nextJackCandidate && nextJackCandidate !== currentJackState) {
          if (jackCandidateStateRef.current === nextJackCandidate) {
            jackCandidateFramesRef.current += 1;
          } else {
            jackCandidateStateRef.current = nextJackCandidate;
            jackCandidateFramesRef.current = 1;
          }

          if (jackCandidateFramesRef.current >= 2) {
            const prevJackState = jackPhaseRef.current;
            jackPhaseRef.current = nextJackCandidate;
            jackCandidateStateRef.current = null;
            jackCandidateFramesRef.current = 0;

            if (jackPhaseRef.current === "open") {
              jackOpenReachedRef.current = true;
            }
          }
        } else {
          jackCandidateStateRef.current = null;
          jackCandidateFramesRef.current = 0;
        }

        if (wristSpread > 0.45 && ankleSpread > 0.35) {
          jackOpenReachedRef.current = true;
        }

        if (
          jackOpenReachedRef.current &&
          wristSpread < 0.28 &&
          ankleSpread < 0.22 &&
          Date.now() - repLastCountTsRef.current > 400
        ) {
          console.debug("[PoseDebug] Jumping Jack rep trigger", {
            phase: jackPhaseRef.current,
            wristSpread,
            ankleSpread,
            jackOpenReached: jackOpenReachedRef.current,
            debounceMs: Date.now() - repLastCountTsRef.current,
          });
          repLastCountTsRef.current = Date.now();
          jackOpenReachedRef.current = false;
          countRepByAccuracy(posture, "jumping jack");
        }

        const debounceReady = Date.now() - repLastCountTsRef.current > 400;
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
            threshold: "> 400ms",
            pass: debounceReady,
          },
        ]);

        if (armOpenScore < 60) return { feedback: { text: "Open your arms wider for full jack range.", type: "warning" }, posture };
        if (legOpenScore < 60) return { feedback: { text: "Jump your feet wider for full jack range.", type: "warning" }, posture };
        return { feedback: { text: "Form looks good. Fully open and close to count each rep.", type: "success" }, posture };
      }

      if (selectedExercise === "Plank") {
        const leftFootPoint = preferVisiblePoint(lAnkle, lKnee);
        const rightFootPoint = preferVisiblePoint(rAnkle, rKnee);
        const plankLineRaw =
          (angleFromThreePoints(lShoulder, lHip, leftFootPoint) + angleFromThreePoints(rShoulder, rHip, rightFootPoint)) / 2;
        smoothedAnglesRef.current.plank = smoothValue(smoothedAnglesRef.current.plank, plankLineRaw);
        const plankLineAngle = smoothedAnglesRef.current.plank;
        const lineScore = scoreInRange(plankLineAngle, 155, 180, 25);
        const shoulderStackScore = clamp(100 - (Math.abs(lShoulder.x - lElbow.x) + Math.abs(rShoulder.x - rElbow.x)) * 160, 0, 100);
        const torsoYDelta = (Math.abs(lShoulder.y - lHip.y) + Math.abs(rShoulder.y - rHip.y)) / 2;
        const legYDelta = (Math.abs(lHip.y - leftFootPoint.y) + Math.abs(rHip.y - rightFootPoint.y)) / 2;
        const horizontalScore = Math.round(
          clamp(100 - (torsoYDelta / 0.22) * 100, 0, 100) * 0.6 +
          clamp(100 - (legYDelta / 0.28) * 100, 0, 100) * 0.4
        );
        const posture = Math.round(lineScore * 0.5 + shoulderStackScore * 0.25 + horizontalScore * 0.25);

        const nowMs = performance.now();
        const postureValid = posture >= 55 && horizontalScore >= 35;

        if (postureValid) {
          if (!plankRunningRef.current) {
            plankRunningRef.current = true;
            plankLastTickTsRef.current = nowMs;
          } else if (plankLastTickTsRef.current !== null) {
            const deltaMs = Math.max(0, nowMs - plankLastTickTsRef.current);
            plankAccumulatedMsRef.current += deltaMs;
            if (posture >= 85) {
              plankPerfectAccumulatedMsRef.current += deltaMs;
            }
            plankLastTickTsRef.current = nowMs;
          }
        } else {
          plankRunningRef.current = false;
          plankLastTickTsRef.current = null;
        }

        // NOTE: activePlankTime/plankCompleted state updates are intentionally done
        // in a timer effect (300ms) to avoid frame-loop state churn.
        const nextActiveSeconds = plankAccumulatedMsRef.current / 1000;

        console.debug("[PoseDebug] Plank timer", {
          posture,
          postureValid,
          activePlankTime: Number(nextActiveSeconds.toFixed(1)),
          totalElapsedTime,
          targetPlankTime,
          plankCompleted,
          timerState: plankRunningRef.current ? "running" : "paused",
        });

        const timerProgressReady = nextActiveSeconds >= targetPlankTime;
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
            label: "Horizontal body score",
            current: `${horizontalScore.toFixed(1)}%`,
            threshold: ">= 35%",
            pass: horizontalScore >= 35,
          },
          {
            label: "Posture score",
            current: `${posture}%`,
            threshold: ">= 55%",
            pass: posture >= 55 && horizontalScore >= 35,
          },
          {
            label: "Active hold",
            current: `${nextActiveSeconds.toFixed(1)}s`,
            threshold: `>= ${targetPlankTime}s`,
            pass: timerProgressReady,
          },
          {
            label: "Timer state",
            current: plankRunningRef.current ? "running" : "paused",
            threshold: "running when posture >= 70%",
            pass: posture >= 70 ? plankRunningRef.current : !plankRunningRef.current,
          },
        ]);

        if (horizontalScore < 35) return { feedback: { text: "Get into floor plank position. Standing posture does not count.", type: "warning" }, posture };
        if (lineScore < 65) return { feedback: { text: "Keep your hips aligned with shoulders and ankles.", type: "warning" }, posture };
        if (shoulderStackScore < 60) return { feedback: { text: "Stack your shoulders over elbows for better plank support.", type: "warning" }, posture };
        if (!plankCompleted) {
          return {
            feedback: {
              text: `Plank form looks good. Hold for ${Math.max(targetPlankTime - nextActiveSeconds, 0)}s more.`,
              type: "success",
            },
            posture,
          };
        }
        return { feedback: { text: "Plank goal completed! Timer paused. Please log your workout.", type: "success" }, posture };
      }

      const genericPosture = Math.round(scoreFromRange(backAngle, 165, 45));
      commitChecks("tracking", []);
      return {
        feedback: { text: "Tracking posture. Maintain steady controlled movement.", type: "success" },
        posture: genericPosture,
      };
    },
    [plankCompleted, pushFeedback, selectedExercise, targetPlankTime, totalElapsedTime]
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

      const distance = getDistanceStatus(selectedExercise, activeLandmarks);
      setDistanceStatus(distance.status);
      setDistanceHint(distance.hint);

      drawConnectors(ctx, activeLandmarks, POSE_CONNECTIONS, { color: "#22c55e", lineWidth: 3 });
      drawLandmarks(ctx, activeLandmarks, { color: "#14b8a6", lineWidth: 2, radius: 3 });

      const visibilityThreshold =
        selectedExercise === "Biceps Curl"
          ? lowLightRef.current
            ? 0.25
            : 0.35
          : lowLightRef.current
            ? 0.3
            : 0.45;
      if (!hasExerciseVisibility(selectedExercise, activeLandmarks, visibilityThreshold)) {
        const visibilityHelpText =
          selectedExercise === "Biceps Curl"
            ? "Adjust so shoulders, elbows, and wrists stay visible."
            : selectedExercise === "Pushup" || selectedExercise === "Plank"
              ? "Adjust so shoulders, hips, and knees are visible on one side."
              : selectedExercise === "Jumping Jack"
                ? "Adjust so both body sides (arms, hips, legs) stay visible."
                : "Adjust so one full body side (shoulder to ankle) is visible.";
        pushFeedback({
          text: visibilityHelpText,
          type: "warning",
        });
        console.debug("[PoseDebug] Low visibility warning", {
          exercise: selectedExercise,
          message: visibilityHelpText,
        });
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

  const ensurePose = useCallback(async (warmupImage?: CanvasImageSource) => {
    if (poseRef.current) return;

    let lastError: unknown = null;
    let lastBaseUrl = "";

    for (const baseUrl of POSE_ASSET_BASE_URLS) {
      try {
        lastBaseUrl = baseUrl;
        const pose = new Pose({
          locateFile: (file) => `${baseUrl}/${file}`,
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        pose.onResults(onPoseResults);

        // Warmup run to verify model assets are reachable using the current video frame.
        if (warmupImage) {
          await pose.send({ image: warmupImage });
        }

        poseRef.current = pose;
        return;
      } catch (error) {
        lastError = error;
      }
    }

    const detail =
      lastError instanceof Error
        ? `${lastBaseUrl} | ${lastError.name || "Error"}: ${lastError.message}`
        : lastBaseUrl || "unknown-source";
    throw new Error(`pose-model-load-failed:${detail}`);
  }, [onPoseResults]);

  useEffect(() => {
    if (!poseRef.current) return;
    // Keep MediaPipe callback in sync with latest selected exercise/state.
    poseRef.current.onResults(onPoseResults);
  }, [onPoseResults]);

  const startCamera = useCallback(async () => {
    setErrorMessage(null);

    if (!window.isSecureContext) {
      setErrorMessage("Camera requires a secure connection (HTTPS). Please open the deployed HTTPS URL.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Camera is not supported in this browser.");
      return;
    }

    try {
      let stream: MediaStream | null = null;
      let lastCameraError: unknown = null;
      for (const constraints of CAMERA_CONSTRAINTS) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (error) {
          lastCameraError = error;
          stream = null;
        }
      }

      if (!stream) {
        throw lastCameraError ?? new Error("camera-unavailable");
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        setErrorMessage("Video element is unavailable.");
        return;
      }

      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      video.srcObject = stream;

      await waitForVideoMetadata(video);

      try {
        await video.play();
      } catch {
        // Some mobile browsers need a second play call after metadata is available.
        try {
          await video.play();
        } catch {
          throw new Error("video-playback-failed");
        }
      }

      await ensurePose(video);
      setCameraOn(true);
      startTimeRef.current = performance.now();
      setElapsedSeconds(0);
      lastProcessedTsRef.current = 0;
      frameCounterRef.current = 0;
      startDetectionLoop();
      pushFeedback({ text: "Camera started. AI detection is live.", type: "success" });
    } catch (error) {
      const inAppBrowserPattern = /(FBAN|FBAV|Instagram|Line\/[\d.]+|MicroMessenger|; wv\)|WebView)/i;
      const inAppHint = inAppBrowserPattern.test(navigator.userAgent)
        ? " If this page is opened in an in-app browser, use the menu and open it in Chrome or Safari."
        : "";

      setErrorMessage(`${getCameraErrorMessage(error)}${inAppHint}`);
      stopCamera();
    }
  }, [ensurePose, pushFeedback, startDetectionLoop, stopCamera]);

  useEffect(() => {
    if (!cameraOn) return;

    const timer = window.setInterval(() => {
      if (!startTimeRef.current) return;
      const seconds = Math.floor((performance.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(seconds);
      setTotalElapsedTime(seconds);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cameraOn]);

  useEffect(() => {
    if (!cameraOn || selectedExercise !== "Plank") return;

    const plankUiTimer = window.setInterval(() => {
      const activeSeconds = plankAccumulatedMsRef.current / 1000;
      const perfectSeconds = plankPerfectAccumulatedMsRef.current / 1000;
      const elapsedSeconds = startTimeRef.current ? (performance.now() - startTimeRef.current) / 1000 : 0;
      setActivePlankTime(Number(activeSeconds.toFixed(1)));
      setPerfectPlankTime(Number(perfectSeconds.toFixed(1)));

      const milestoneCount = Math.floor(elapsedSeconds / targetPlankTime);
      if (milestoneCount >= 1) {
        setPlankCompleted(true);
        if (!plankCompletionAnnouncedRef.current) {
          plankCompletionAnnouncedRef.current = true;
          setPerfectPlankTimeAtTarget(Number(perfectSeconds.toFixed(1)));
          pushFeedback({ text: "Goal reached! Perfect plank recorded. You can log workout now.", type: "success" });
        }
      }

      if (milestoneCount > plankMilestoneCountRef.current) {
        const newMilestones = milestoneCount - plankMilestoneCountRef.current;
        plankMilestoneCountRef.current = milestoneCount;

        for (let i = 0; i < newMilestones; i += 1) {
          playCompletionBeep();
        }
      }

      console.debug("[PoseDebug] Plank UI timer tick", {
        activePlankTime: Number(activeSeconds.toFixed(1)),
        elapsedTimer: Number(elapsedSeconds.toFixed(1)),
        targetPlankTime,
        plankCompleted: elapsedSeconds >= targetPlankTime,
        timerState: plankRunningRef.current ? "running" : "paused",
      });
    }, 300);

    return () => window.clearInterval(plankUiTimer);
  }, [cameraOn, playCompletionBeep, selectedExercise, targetPlankTime, pushFeedback]);

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
    activePlankTime,
    perfectPlankTime,
    perfectPlankTimeAtTarget,
    totalElapsedTime,
    targetPlankTime,
    plankCompleted,
    setTargetPlankTime,
    startCamera,
    stopCamera,
    resetSession,
  };
}
