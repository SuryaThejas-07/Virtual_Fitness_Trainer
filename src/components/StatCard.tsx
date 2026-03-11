import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  variant?: "default" | "primary" | "accent";
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, variant = "default" }: StatCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-card rounded-xl border p-5 shadow-card hover:shadow-card-hover transition-shadow"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
          variant === "primary" ? "bg-primary/10" :
          variant === "accent" ? "bg-accent/10" :
          "bg-secondary"
        }`}>
          <Icon className={`h-5 w-5 ${
            variant === "primary" ? "text-primary" :
            variant === "accent" ? "text-accent" :
            "text-muted-foreground"
          }`} />
        </div>
        {trend && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            trend.positive ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
          }`}>
            {trend.positive ? "+" : ""}{trend.value}%
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-1">{title}</p>
      <p className="text-2xl font-display font-bold">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </motion.div>
  );
}
