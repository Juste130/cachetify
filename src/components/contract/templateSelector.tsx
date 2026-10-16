"use client";

import React from "react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { AiBadge } from "../ui/ai-badge";
import { FileCode2, LucideIcon } from "lucide-react";

export interface TemplateItem {
  id: string | number;
  name: string;
  description: string;
  icon?: LucideIcon;
  uses?: number;
  isAi?: boolean;
}

interface TemplateSelectorProps {
  templates: TemplateItem[];
  selectedId?: string | number;
  onSelect: (template: TemplateItem) => void;
  actionLabel?: string;
}

export function TemplateSelector({
  templates,
  selectedId,
  onSelect,
  actionLabel = "Utiliser",
}: TemplateSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {templates.map((tpl) => {
        const Icon = tpl.icon || FileCode2;
        const isSelected = tpl.id === selectedId;

        return (
          <Card
            key={tpl.id}
            className={`p-6 hover:shadow-lg transition-all flex flex-col justify-between ${
              isSelected ? "border-[#FFC107] ring-2 ring-[#FFC107]/20" : ""
            }`}
          >
            <div>
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#FFC107]/10 flex items-center justify-center text-[#FFC107]">
                  <Icon className="w-6 h-6" />
                </div>
                {tpl.isAi && <AiBadge />}
              </div>

              <h3 className="mb-2 font-bold text-lg">{tpl.name}</h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {tpl.description}
              </p>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border/50">
              {tpl.uses !== undefined ? (
                <p className="text-xs text-muted-foreground">
                  {tpl.uses} utilisations
                </p>
              ) : (
                <span />
              )}
              <Button
                className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300]"
                onClick={() => onSelect(tpl)}
              >
                {actionLabel}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
