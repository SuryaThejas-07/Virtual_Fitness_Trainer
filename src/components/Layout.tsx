import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, LayoutDashboard, Dumbbell, BookOpen, ClipboardList,
  Apple, HeartPulse, BarChart3, Menu, X, LogIn, LogOut, User
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { FloatingChatbot } from "./FloatingChatbot";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const navItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/ai-trainer", label: "AI Trainer", icon: Dumbbell },
  { path: "/exercises", label: "Exercises", icon: BookOpen },
  { path: "/workouts", label: "Workouts", icon: ClipboardList },
  { path: "/nutrition", label: "Nutrition", icon: Apple },
  { path: "/health", label: "Health", icon: HeartPulse },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 glass border-b">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-primary flex items-center justify-center">
              <Dumbbell className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">FitAI Pro</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute inset-0 bg-primary/10 rounded-md"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <div className="hidden lg:flex items-center gap-1">
                <Link to="/profile">
                  <Button variant="ghost" size="sm" className="flex items-center gap-1.5">
                    <User className="h-4 w-4" />
                    <span className="text-sm">Profile</span>
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={logout} className="flex items-center gap-1.5">
                  <LogOut className="h-4 w-4" />
                  <span className="text-sm">Logout</span>
                </Button>
              </div>
            ) : (
              <Link to="/login" className="hidden lg:block">
                <Button variant="ghost" size="sm" className="flex items-center gap-1.5">
                  <LogIn className="h-4 w-4" />
                  <span className="text-sm">Login</span>
                </Button>
              </Link>
            )}
            <button
              className="lg:hidden p-2 rounded-md hover:bg-secondary transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden border-t overflow-hidden"
            >
              <div className="p-4 grid grid-cols-2 gap-2">
                {navItems.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
                {user ? (
                  <>
                    <Link
                      to="/profile"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary col-span-2"
                    >
                      <User className="h-4 w-4" /> Profile
                    </Link>
                    <button
                      onClick={() => { logout(); setMobileOpen(false); }}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary col-span-2"
                    >
                      <LogOut className="h-4 w-4" /> Logout
                    </button>
                  </>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary col-span-2"
                  >
                    <LogIn className="h-4 w-4" /> Login
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <main>{children}</main>
      <FloatingChatbot />
    </div>
  );
}
