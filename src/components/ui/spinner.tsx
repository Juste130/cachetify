import { cn } from "@/lib/utils";

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg" | "xl";
  label?: string;
}

export function Spinner({ className, size = "md", label, ...props }: SpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4 border-2",
    md: "w-8 h-8 border-[3px]",
    lg: "w-12 h-12 border-4",
    xl: "w-16 h-16 border-4",
  };

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)} {...props}>
      <div className="relative flex items-center justify-center">
        {/* Outer subtle ring */}
        <div className={cn(
          "absolute rounded-full border-[#FFC107]/20 border-t-transparent border-b-transparent animate-ping",
          sizeClasses[size]
        )} style={{ animationDuration: '2s' }} />
        
        {/* Medium spinning ring */}
        <div className={cn(
          "absolute rounded-full border-transparent border-t-[#FFC107]/40 border-b-[#FFC107]/40 animate-spin",
          sizeClasses[size]
        )} style={{ animationDuration: '1.5s' }} />
        
        {/* Inner fast spinning ring */}
        <div className={cn(
          "rounded-full border-transparent border-l-[#FFC107] border-r-[#FFB300] animate-spin",
          sizeClasses[size]
        )} style={{ animationDuration: '0.8s' }} />
      </div>
      
      {label && (
        <p className="text-sm font-medium text-muted-foreground animate-pulse">
          {label}
        </p>
      )}
    </div>
  );
}
