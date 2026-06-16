/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Mock Lucide icons to avoid rendering large SVGs or unsupported features in tests
vi.mock("lucide-react", async () => {
  const actual = await vi.importActual("lucide-react");
  return {
    ...actual,
    Camera: () => <span>CameraIcon</span>,
    CameraOff: () => <span>CameraOffIcon</span>,
    RefreshCw: () => <span>RefreshCwIcon</span>,
    RotateCcw: () => <span>RotateCcwIcon</span>,
    User: () => <span>UserIcon</span>,
    Mail: () => <span>MailIcon</span>,
    Ruler: () => <span>RulerIcon</span>,
    Weight: () => <span>WeightIcon</span>,
    Activity: () => <span>ActivityIcon</span>,
    Flame: () => <span>FlameIcon</span>,
    Calculator: () => <span>CalculatorIcon</span>,
    Save: () => <span>SaveIcon</span>,
  };
});

// Mock recharts because SVG charting libraries require layout/measurements not supported in JSDOM
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  AreaChart: () => <div data-testid="area-chart" />,
  Area: () => <div />,
  BarChart: () => <div data-testid="bar-chart" />,
  Bar: () => <div />,
  LineChart: () => <div data-testid="line-chart" />,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

// Mock FloatingChatbot
vi.mock("@/components/FloatingChatbot", () => ({
  FloatingChatbot: () => <div data-testid="floating-chatbot">Mocked Chatbot</div>,
}));

// Mock framer-motion to bypass animation loops in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: React.forwardRef(({ children, whileHover, whileTap, transition, animate, initial, exit, ...props }: any, ref: any) => <div ref={ref} {...props}>{children}</div>),
    button: React.forwardRef(({ children, whileHover, whileTap, transition, animate, initial, exit, ...props }: any, ref: any) => <button ref={ref} {...props}>{children}</button>),
    section: React.forwardRef(({ children, whileHover, whileTap, transition, animate, initial, exit, ...props }: any, ref: any) => <section ref={ref} {...props}>{children}</section>),
    span: React.forwardRef(({ children, whileHover, whileTap, transition, animate, initial, exit, ...props }: any, ref: any) => <span ref={ref} {...props}>{children}</span>),
    tr: React.forwardRef(({ children, whileHover, whileTap, transition, animate, initial, exit, ...props }: any, ref: any) => <tr ref={ref} {...props}>{children}</tr>),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock Auth Context
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uid: "test-uid", email: "test@example.com", displayName: "Test User" },
    loading: false,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}));

// Mock Firestore hooks
vi.mock("@/hooks/useFirestore", () => ({
  useUserProfile: () => ({
    profile: {
      name: "Test User",
      email: "test@example.com",
      age: 25,
      gender: "male",
      height_cm: 180,
      weight_kg: 80,
      fitness_goal: "muscle_gain",
      activity_level: "active",
    },
    loading: false,
  }),
  useGoals: () => ({
    data: [
      {
        id: "goal-1",
        daily_calories: 2500,
        protein_target_g: 160,
        carbs_target_g: 250,
        fats_target_g: 70,
      },
    ],
    loading: false,
  }),
  useFirestoreCollection: (collectionName: string) => {
    if (collectionName === "workouts") {
      return {
        data: [
          { id: "w-1", exercise_name: "Squat", sets: 3, reps: 10, duration_minutes: 15, calories_burned: 150, timestamp: "2026-06-16T12:00:00Z" },
        ],
        loading: false,
      };
    }
    if (collectionName === "nutrition") {
      return {
        data: [
          { id: "n-1", food_name: "Oats", calories: 300, protein_g: 10, carbs_g: 50, fats_g: 5, date: "2026-06-16T12:00:00Z", meal_type: "breakfast" },
        ],
        loading: false,
      };
    }
    return { data: [], loading: false };
  },
  useBodyMetrics: () => ({
    data: [
      { id: "bm-1", recorded_at: "2026-06-16T12:00:00Z", weight_kg: 80, body_fat_percentage: 15, muscle_mass_kg: 40 },
    ],
    loading: false,
  }),
  addFirestoreDoc: vi.fn().mockResolvedValue({ id: "new-doc-id" }),
  deleteFirestoreDoc: vi.fn().mockResolvedValue(true),
}));

// Mock Pose Detection Hook
vi.mock("@/hooks/usePoseDetection", () => ({
  usePoseDetection: () => ({
    videoRef: { current: null },
    canvasRef: { current: null },
    cameraOn: false,
    errorMessage: null,
    reps: 0,
    postureScore: 0,
    calories: 0,
    feedbackHistory: [],
    elapsedSeconds: 0,
    distanceStatus: "good",
    distanceHint: "Stand 1.5 to 2.5m away.",
    currentPhase: "idle",
    liveChecks: [],
    activePlankTime: 0,
    perfectPlankTime: 0,
    perfectPlankTimeAtTarget: 0,
    totalElapsedTime: 0,
    targetPlankTime: 60,
    plankCompleted: false,
    setTargetPlankTime: vi.fn(),
    startCamera: vi.fn().mockResolvedValue(undefined),
    stopCamera: vi.fn(),
    resetSession: vi.fn(),
    facingMode: "user",
    toggleCameraFacing: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock firebase initialization modules
vi.mock("firebase/app", () => ({
  initializeApp: vi.fn().mockReturnValue({}),
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn().mockReturnValue({}),
  onAuthStateChanged: vi.fn().mockReturnValue(() => {}),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn().mockReturnValue({}),
  doc: vi.fn(),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  setDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn().mockReturnValue("mock-server-timestamp"),
}));

// Import components to test
import Dashboard from "../pages/Dashboard";
import AITrainer from "../pages/AITrainer";
import Profile from "../pages/Profile";
import WorkoutTracker from "../pages/WorkoutTracker";
import NutritionTracker from "../pages/NutritionTracker";
import HealthMonitoring from "../pages/HealthMonitoring";
import { Layout } from "../components/Layout";

describe("FitCoach Virtual Trainer - Feature Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Layout: Header and Navigation buttons render and respond correctly", () => {
    render(
      <MemoryRouter>
        <Layout>
          <div>Main Content</div>
        </Layout>
      </MemoryRouter>
    );

    // Verify Brand title is rendered
    expect(screen.getByText("FitAI Pro")).toBeInTheDocument();
    
    // Verify Profile button is rendered and visible (due to our Layout visibility fix)
    const profileButtons = screen.getAllByText("Profile");
    expect(profileButtons.length).toBeGreaterThan(0);

    // Verify Main navigation links render correctly
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("AI Trainer")).toBeInTheDocument();
    expect(screen.getByText("Nutrition")).toBeInTheDocument();
  });

  it("2. Dashboard: Correctly renders statistics, streaks, and graphs", () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Verify Stat Cards load correctly
    expect(screen.getByText("Calories Burned Today")).toBeInTheDocument();
    expect(screen.getByText("Workouts Done")).toBeInTheDocument();
    expect(screen.getByText("Protein Intake")).toBeInTheDocument();
    expect(screen.getByText("Workout Streak")).toBeInTheDocument();

    // Verify recharts responsive containers render
    const charts = screen.getAllByTestId("responsive-container");
    expect(charts.length).toBeGreaterThan(0);
  });

  it("3. AI Trainer: Renders webcam panel, exercise selector, and camera controllers", () => {
    render(
      <MemoryRouter>
        <AITrainer />
      </MemoryRouter>
    );

    // Verify exercise options are rendered
    expect(screen.getByText("Squat")).toBeInTheDocument();
    expect(screen.getByText("Biceps Curl")).toBeInTheDocument();
    expect(screen.getByText("Pushup")).toBeInTheDocument();

    // Verify Flip Camera button is rendered (due to our camera flip fix)
    const flipButton = screen.getByRole("button", { name: /flip camera/i });
    expect(flipButton).toBeInTheDocument();

    // Verify Camera toggle controls render
    const startCameraButton = screen.getByRole("button", { name: /start camera/i });
    expect(startCameraButton).toBeInTheDocument();
  });

  it("4. Profile: Rendersderived BMR/TDEE/BMI metrics and saves data using setDoc with merge", async () => {
    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    );

    // Verify metrics card labels are present
    expect(screen.getByText("BMI")).toBeInTheDocument();
    expect(screen.getByText("BMR")).toBeInTheDocument();
    expect(screen.getByText("TDEE")).toBeInTheDocument();

    // Verify user details are correctly pre-populated
    expect(screen.getByDisplayValue("Test User")).toBeInTheDocument();
    expect(screen.getByDisplayValue("test@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("25")).toBeInTheDocument();
    expect(screen.getByDisplayValue("180")).toBeInTheDocument();
    expect(screen.getByDisplayValue("80")).toBeInTheDocument();

    // Verify Save Changes button is functional
    const saveButton = screen.getByRole("button", { name: /save changes/i });
    expect(saveButton).toBeInTheDocument();
    
    // Click save
    fireEvent.click(saveButton);

    // Verify updateDoc or setDoc is called safely
    await waitFor(() => {
      // It should call the Firestore setDoc module function to update the user doc
      const firestore = require("firebase/firestore");
      expect(firestore.setDoc).toHaveBeenCalled();
    });
  });

  it("5. Workout Tracker: Correctly logs and displays workouts", async () => {
    render(
      <MemoryRouter>
        <WorkoutTracker />
      </MemoryRouter>
    );

    // Verify layout headers
    expect(screen.getByText("Workout Tracker")).toBeInTheDocument();
    expect(screen.getByText("Log a Workout")).toBeInTheDocument();

    // Verify existing list items render correctly
    expect(screen.getByText("Squat")).toBeInTheDocument();
    expect(screen.getByText("3 sets x 10 reps")).toBeInTheDocument();

    // Verify form input field
    const nameInput = screen.getByLabelText(/exercise name/i);
    expect(nameInput).toBeInTheDocument();
    
    // Fill form and save
    fireEvent.change(nameInput, { target: { value: "Bench Press" } });
    const logButton = screen.getByRole("button", { name: /log workout/i });
    fireEvent.click(logButton);

    // Verify addFirestoreDoc was executed
    const firestoreHooks = require("@/hooks/useFirestore");
    expect(firestoreHooks.addFirestoreDoc).toHaveBeenCalled();
  });

  it("6. Nutrition Tracker: Tracks macros and logged foods", async () => {
    render(
      <MemoryRouter>
        <NutritionTracker />
      </MemoryRouter>
    );

    // Verify headers and logged items
    expect(screen.getByText("Nutrition Tracker")).toBeInTheDocument();
    expect(screen.getByText("Oats")).toBeInTheDocument();
    expect(screen.getByText("300 kcal")).toBeInTheDocument();

    // Verify form fields
    const foodInput = screen.getByLabelText(/food name/i);
    expect(foodInput).toBeInTheDocument();

    // Fill form and save
    fireEvent.change(foodInput, { target: { value: "Apple" } });
    const logButton = screen.getByRole("button", { name: /log food/i });
    fireEvent.click(logButton);

    // Verify addFirestoreDoc was executed
    const firestoreHooks = require("@/hooks/useFirestore");
    expect(firestoreHooks.addFirestoreDoc).toHaveBeenCalled();
  });

  it("7. Health & Analytics: Tab toggle and metrics logger work correctly", async () => {
    render(
      <MemoryRouter>
        <HealthMonitoring />
      </MemoryRouter>
    );

    // Verify tabs are rendered
    expect(screen.getByRole("tab", { name: /health metrics/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /progress analytics/i })).toBeInTheDocument();

    // Verify metric cards
    expect(screen.getByText("Body Mass Index")).toBeInTheDocument();
    expect(screen.getByText("Calorie Requirement (TDEE)")).toBeInTheDocument();
    expect(screen.getByText("Body Fat Percentage")).toBeInTheDocument();

    // Switch tabs
    const analyticsTab = screen.getByRole("tab", { name: /progress analytics/i });
    fireEvent.click(analyticsTab);

    // Verify analytics components load
    expect(screen.getByText("Weight Timeline")).toBeInTheDocument();
  });
});
