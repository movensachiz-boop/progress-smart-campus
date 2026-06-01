import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  variant?: "primary" | "accent" | "success" | "warning" | "destructive";
}

const variantStyles = {
  primary: {
    icon: "bg-primary/10 text-primary",
    border: "border-l-4 border-l-primary",
  },
  accent: {
    icon: "bg-accent/20 text-accent-foreground",
    border: "border-l-4 border-l-accent",
  },
  success: {
    icon: "bg-success/10 text-success",
    border: "border-l-4 border-l-success",
  },
  warning: {
    icon: "bg-warning/10 text-warning",
    border: "border-l-4 border-l-warning",
  },
  destructive: {
    icon: "bg-destructive/10 text-destructive",
    border: "border-l-4 border-l-destructive",
  },
};

const StatCard = ({ title, value, subtitle, icon: Icon, variant = "primary" }: StatCardProps) => (
  <Card className={cn(
    "shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-0.5",
    variantStyles[variant].border
  )}>
    <CardContent className="flex items-center gap-4 p-5">
      <div className={cn("p-3 rounded-xl", variantStyles[variant].icon)}>
        <Icon size={22} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </CardContent>
  </Card>
);

export default StatCard;
