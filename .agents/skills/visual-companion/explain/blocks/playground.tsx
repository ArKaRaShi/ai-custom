/** Playground: sliders and number fields for the lesson's inputs, what-if presets, and Reset. Sticky while its section scrolls. */
import { useStateStore, useStateValue } from "@json-render/react";
import { cn } from "cn";
import { Activity, Gauge, type LucideIcon, RotateCcw, Ruler, TrendingDown, TrendingUp, Wrench, Zap } from "lucide-react";
import type { z } from "zod";
import type { IconName, InputSpec, Preset } from "@/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { InputValues, Model } from "@/evaluate";

const ICONS: Record<z.infer<typeof IconName>, LucideIcon> = {
  wear: TrendingDown,
  ruler: Ruler,
  gauge: Gauge,
  zap: Zap,
  wrench: Wrench,
  activity: Activity,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
};

function Field({ input, value, start, onChange }: { input: InputSpec; value: number; start: number; onChange: (value: number) => void }) {
  const changed = value !== start;
  const id = `input-${input.key}`;
  return (
    <div className="flex flex-col gap-2.5 text-sm text-muted-foreground">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id}>{input.label}</label>
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <Input
            id={id}
            data-input={input.key}
            type="number"
            inputMode="decimal"
            value={value}
            min={input.min}
            max={input.max}
            step={input.step}
            onChange={(event) => {
              const next = event.target.valueAsNumber;
              if (Number.isFinite(next)) onChange(next);
            }}
            className={cn("h-7 w-24 px-2 text-right", changed && "border-primary text-primary")}
          />
          {input.unit && <span className="font-normal text-muted-foreground">{input.unit}</span>}
        </span>
      </div>
      <Slider
        aria-label={input.label}
        min={input.min}
        max={input.max}
        step={input.step}
        value={[value]}
        onValueChange={([next]) => next !== undefined && onChange(next)}
      />
    </div>
  );
}

export function Playground({ presets }: { presets: z.infer<typeof Preset>[] }) {
  const { set } = useStateStore();
  const model = useStateValue<Model>("/model");
  const start = useStateValue<InputValues>("/start") ?? {};
  const values = useStateValue<InputValues>("/inputs") ?? start;
  if (!model) return null;
  return (
    <div data-block="Playground" className="sticky top-3 z-30 my-6 rounded-xl border bg-card/85 px-5 py-4.5 shadow-md backdrop-blur-md">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-6 gap-y-4">
        {model.inputs.map((input) => (
          <Field
            key={input.key}
            input={input}
            value={values[input.key] ?? input.value}
            start={start[input.key] ?? input.value}
            onChange={(next) => set(`/inputs/${input.key}`, next)}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {presets.map((preset) => {
          const Icon = ICONS[preset.icon];
          return (
            <Button key={preset.label} variant="outline" size="sm" className="rounded-full" onClick={() => set("/inputs", { ...start, ...preset.set })}>
              <Icon aria-hidden className="text-primary" />
              {preset.label}
            </Button>
          );
        })}
        <Button variant="ghost" size="sm" className="rounded-full" onClick={() => set("/inputs", start)}>
          <RotateCcw aria-hidden />
          Reset
        </Button>
      </div>
    </div>
  );
}
