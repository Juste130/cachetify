import React, { useState, useRef } from 'react';
import { Input } from './input';
import { Button } from './button';
import { Sparkles, Undo2 } from 'lucide-react';
import { aiApi } from '@/lib/api/ai';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

interface AIInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    context: string;
    onAIChange?: (newValue: string) => void;
    className?: string;
}

export function AIInput({ className, context, value, onChange, onAIChange, ...props }: AIInputProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [history, setHistory] = useState<string[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleCorrect = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!value || typeof value !== 'string') return;

        setIsLoading(true);
        // Save current value to history before changing
        setHistory((prev) => [...prev, value]);

        try {
            const result = await aiApi.correctInput({
                text: value,
                context
            });

            if (result.corrected) {
                // Create a synthetic event to trigger normal onChange
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                if (nativeInputValueSetter && inputRef.current) {
                    nativeInputValueSetter.call(inputRef.current, result.corrected);
                    const event = new Event('input', { bubbles: true });
                    inputRef.current.dispatchEvent(event);
                }

                // Also call specific handler if provided
                if (onAIChange) {
                    onAIChange(result.corrected);
                }
            }
        } catch (error) {
            console.error("Failed to correct input:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUndo = (e: React.MouseEvent) => {
        e.preventDefault();
        if (history.length === 0) return;

        const previousValue = history[history.length - 1];
        setHistory((prev) => prev.slice(0, -1));

        // Restore previous value
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        if (nativeInputValueSetter && inputRef.current) {
            nativeInputValueSetter.call(inputRef.current, previousValue);
            const event = new Event('input', { bubbles: true });
            inputRef.current.dispatchEvent(event);
        }

        if (onAIChange) {
            onAIChange(previousValue);
        }
    };

    return (
        <div className="relative flex items-center">
            <Input
                {...props}
                value={value}
                onChange={onChange}
                ref={inputRef}
                className={cn("pr-20", className)}
            />
            <div className="absolute right-1 flex items-center gap-1">
                {history.length > 0 && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Annuler la correction"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    onClick={handleUndo}
                                    disabled={isLoading}
                                >
                                    <Undo2 className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Annuler la correction</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}

                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Améliorer avec l'IA (Magic Pen)"
                                className={cn(
                                    "h-8 w-8 transition-colors",
                                    isLoading ? "text-muted-foreground" : "text-[#9C27B0] hover:bg-[#9C27B0]/10"
                                )}
                                onClick={handleCorrect}
                                isLoading={isLoading}
                                disabled={isLoading || !value}
                            >
                                {!isLoading && <Sparkles className="h-4 w-4" />}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Améliorer avec IA (Magic Pen)</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
        </div>
    );
}
