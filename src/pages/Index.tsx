import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Activity, Brain, Flame, BarChart3, Dumbbell, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-fitness.jpg";


const features = [
  {
    icon: Brain,
    title: "AI Movement Detection",
    description: "Real-time pose estimation tracks your form and counts reps automatically using your webcam.",
  },
  {
    icon: Flame,
    title: "Smart Calorie Tracking",
    description: "Log meals effortlessly and track your daily macro goals with intelligent food analysis.",
  },
  {
    icon: HeartPulse,
    title: "Health Monitoring",
    description: "Track BMI, body fat, muscle mass, and get personalized calorie recommendations.",
  },
  {
    icon: BarChart3,
    title: "Progress Analytics",
    description: "Detailed charts and insights showing your fitness journey over weeks and months.",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function Index() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImage} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/75 to-black/50" />
        </div>

        <div className="relative container mx-auto px-4 py-24 lg:py-36">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-2xl"
          >
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm font-medium mb-6 border border-white/20" style={{ color: "hsl(0 0% 100%)" }}>
              <Activity className="h-4 w-4" />
              AI-Powered Fitness Platform
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold leading-tight mb-6" style={{ color: "hsl(0 0% 100%)" }}>
              Your Personal
              <span className="text-gradient-primary block">AI Fitness Trainer</span>
            </h1>

            <p className="text-lg leading-relaxed mb-8 max-w-lg" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
              Real-time exercise detection, intelligent coaching, and comprehensive health monitoring — all powered by artificial intelligence.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link to="/ai-trainer">
                <Button size="lg" className="bg-gradient-primary text-primary-foreground font-semibold px-8 h-12 rounded-xl shadow-elevated hover:opacity-90 transition-opacity">
                  <Dumbbell className="h-5 w-5 mr-2" />
                  Start Training
                </Button>
              </Link>
              <Link to="/dashboard">
                <Button size="lg" className="h-12 rounded-xl font-semibold border-2 bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors" style={{ color: "hsl(0 0% 100%)", borderColor: "hsl(0 0% 100% / 0.3)" }}>
                  View Dashboard
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 lg:py-28">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl lg:text-4xl font-display font-bold mb-4">
              Everything You Need to
              <span className="text-gradient-primary"> Transform</span>
            </h2>
            <p className="text-muted-foreground text-lg">
              Our AI-powered platform combines cutting-edge technology with proven fitness science.
            </p>
          </div>

          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {features.map((feat, i) => (
              <motion.div
                key={i}
                variants={item}
                whileHover={{ y: -4 }}
                className="bg-card rounded-2xl border p-6 shadow-card hover:shadow-card-hover transition-all group"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-gradient-primary group-hover:text-primary-foreground transition-colors">
                  <feat.icon className="h-6 w-6 text-primary group-hover:text-primary-foreground transition-colors" />
                </div>
                <h3 className="font-display font-semibold text-lg mb-2">{feat.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feat.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="relative rounded-3xl overflow-hidden bg-gradient-hero p-12 lg:p-16 text-center">
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
              <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-accent/20 blur-3xl" />
            </div>
            <div className="relative">
              <h2 className="text-3xl lg:text-4xl font-display font-bold mb-4" style={{ color: "hsl(0 0% 100%)" }}>
                Start Your AI-Powered Fitness Journey
              </h2>
              <p className="text-lg mb-8 max-w-lg mx-auto" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                Join thousands of users who transformed their bodies with intelligent workout tracking and personalized coaching.
              </p>
              <Link to="/ai-trainer">
                <Button size="lg" className="bg-gradient-primary text-primary-foreground font-semibold px-10 h-12 rounded-xl">
                  Get Started Free
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-gradient-primary flex items-center justify-center">
              <Dumbbell className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-sm">FitAI Pro</span>
          </div>
          <p className="text-sm text-muted-foreground">© 2026 FitAI Pro. AI-Powered Fitness Platform.</p>
        </div>
      </footer>
    </div>
  );
}
