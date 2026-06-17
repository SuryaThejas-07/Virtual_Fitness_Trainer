/* eslint-disable */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";

// Define mock functions with vi.hoisted so they are available inside hoisted vi.mock factories
const { mockAddFirestoreDoc, mockDeleteFirestoreDoc, mockSetDoc } = vi.hoisted(() => ({
  mockAddFirestoreDoc: vi.fn().mockResolvedValue({ id: "new-doc-id" }),
  mockDeleteFirestoreDoc: vi.fn().mockResolvedValue(true),
  mockSetDoc: vi.fn().mockResolvedValue(undefined),
}));

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
  addFirestoreDoc: mockAddFirestoreDoc,
  deleteFirestoreDoc: mockDeleteFirestoreDoc,
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

// Mock firebase modules
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
  setDoc: mockSetDoc,
  serverTimestamp: vi.fn().mockReturnValue("mock-server-timestamp"),
}));

// Import components to test — AFTER all mocks are set up
import Dashboard from "../pages/Dashboard";
import AITrainer from "../pages/AITrainer";
import Profile from "../pages/Profile";
import WorkoutTracker from "../pages/WorkoutTracker";
import NutritionTracker from "../pages/NutritionTracker";
import HealthMonitoring from "../pages/HealthMonitoring";
import { Layout } from "../components/Layout";

describe("FitCoach Virtual Trainer - Feature Verification", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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
    
    // Verify Profile button is rendered and visible
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

    // Verify Flip Camera button is rendered
    const flipButton = screen.getByRole("button", { name: /flip camera/i });
    expect(flipButton).toBeInTheDocument();

    // Verify Camera toggle controls render
    const startCameraButton = screen.getByRole("button", { name: /start camera/i });
    expect(startCameraButton).toBeInTheDocument();
  });

  it("4. Profile: Renders derived BMR/TDEE/BMI metrics and form fields", () => {
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

    // Verify Save Changes button exists
    const saveButton = screen.getByRole("button", { name: /save changes/i });
    expect(saveButton).toBeInTheDocument();
  });

  it("5. Workout Tracker: Correctly renders and displays workouts", () => {
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
  });

  it("6. Nutrition Tracker: Tracks macros and logged foods", () => {
    render(
      <MemoryRouter>
        <NutritionTracker />
      </MemoryRouter>
    );

    // Verify headers and logged items
    expect(screen.getByText("Nutrition Tracker")).toBeInTheDocument();
    expect(screen.getByText("Oats")).toBeInTheDocument();
    expect(screen.getByText("300 kcal")).toBeInTheDocument();
  });

  it("7. Health & Analytics: Tab toggle and metrics render correctly", () => {
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
