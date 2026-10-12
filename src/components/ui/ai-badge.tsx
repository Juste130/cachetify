import { Brain } from "lucide-react";
import { Badge } from "./badge";

interface AiBadgeProps {
  className?: string;
}

export function AiBadge({ className }: AiBadgeProps) {
  return (
    <Badge 
      className={`bg-[#9C27B0] text-white hover:bg-[#7B1FA2] ${className || ''}`}
    >
      <Brain className="w-3 h-3 mr-1" />
      IA
    </Badge>
  );
}
