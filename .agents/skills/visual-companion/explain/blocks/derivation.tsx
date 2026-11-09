/** Derivation: Formula -> Substitute -> Result per step, recomputed live from the Playground's inputs. */
import { useStateValue } from "@json-render/react";
import katex from "katex";
import { ArrowRight, CircleAlert, Code2 } from "lucide-react";
import { useMemo } from "react";
import type { StepSpec } from "@/catalog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  evaluatePartial,
  fillTemplate,
  formatNumber,
  formulaTex,
  type InputValues,
  knownBefore,
  type Model,
  type StepResult,
  substituteTex,
} from "@/evaluate";
import { cn } from "cn";

function Tex({ src }: { src: string }) {
  const html = katex.renderToString(src, { throwOnError: false, displayMode: false });
  return <span className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Delta({ now, base, unit }: { now: number; base: number | undefined; unit: string | undefined }) {
  const changed = base !== undefined && Math.abs(now - base) > 1e-9 * Math.max(1, Math.abs(base));
  return (
    <span data-result className={cn("inline-flex items-baseline gap-2 text-[22px]", changed && "text-primary")}>
      {changed && (
        <>
          <s data-old className="text-[15px] text-muted-foreground">{formatNumber(base)}</s>
          <ArrowRight size={16} aria-hidden className="self-center text-muted-foreground" />
        </>
      )}
      <b data-new className={cn("font-bold tracking-tight", changed && "animate-in zoom-in-110 duration-300")}>{formatNumber(now)}</b>
      {unit && <small className="text-sm text-muted-foreground">{unit}</small>}
    </span>
  );
}

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[110px_1fr] items-center gap-3 px-4.5 py-3", className)}>
      <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">{label}</span>
      <div className="min-w-0 overflow-x-auto">{children}</div>
    </div>
  );
}

function StepItem({ step, index, model, values, now, base, error }: {
  step: StepSpec;
  index: number;
  model: Model;
  values: InputValues;
  now: Map<string, StepResult>;
  base: Map<string, StepResult> | undefined;
  /** Set on the step that failed for these inputs, or on a later step that depends on it. */
  error: { stepId: string; message: string } | undefined;
}) {
  const known = knownBefore(model, values, now, step.id);
  const result = now.get(step.id);
  const substitute = step.substitute ? fillTemplate(step.substitute, known) : substituteTex(step, known);
  return (
    <li data-step={step.id} data-value={result?.value} className="relative grid grid-cols-[40px_1fr] gap-4 pb-7 [&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:top-11 [&:not(:last-child)]:before:bottom-1.5 [&:not(:last-child)]:before:left-[19px] [&:not(:last-child)]:before:w-0.5 [&:not(:last-child)]:before:bg-gradient-to-b [&:not(:last-child)]:before:from-border [&:not(:last-child)]:before:to-transparent">
      <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-2 font-bold text-primary-foreground shadow-md">{index + 1}</div>
      <div className="min-w-0">
        <header className="flex flex-wrap items-baseline gap-3">
          <h3 className="m-0 text-lg font-semibold">{step.title}</h3>
          <Badge variant="outline" className="font-mono text-muted-foreground"><Code2 aria-hidden />{step.ref}</Badge>
        </header>
        <p className="mt-1.5 mb-3 text-muted-foreground">{step.plain}</p>
        <Card className="gap-0 overflow-hidden py-0">
          <Row label="Formula"><Tex src={`${step.id} = ${formulaTex(step)}`} /></Row>
          <Separator />
          <Row label="Substitute">
            {step.substitute ? <span className="font-mono text-sm text-muted-foreground">{substitute}</span> : <Tex src={`${step.id} = ${substitute}`} />}
          </Row>
          <Separator />
          <Row label="Result" className="bg-accent">
            {result && <Delta now={result.value} base={base?.get(step.id)?.value} unit={step.unit} />}
            {!result && error && (
              <Alert variant="destructive" data-step-error={error.stepId} className="border-0 bg-transparent p-0">
                <CircleAlert aria-hidden />
                <AlertTitle>{error.stepId === step.id ? "These inputs break this step" : `Waits on step ${error.stepId}`}</AlertTitle>
                {error.stepId === step.id && <AlertDescription>{error.message}</AlertDescription>}
              </Alert>
            )}
          </Row>
        </Card>
      </div>
    </li>
  );
}

export function Derivation({ steps }: { steps: StepSpec[] }) {
  const model = useStateValue<Model>("/model");
  const values = useStateValue<InputValues>("/inputs") ?? {};
  const start = useStateValue<InputValues>("/start") ?? {};
  const base = useMemo(() => (model ? evaluatePartial(model, start).results : undefined), [model, start]);
  if (!model) return null;
  // Steps before a failing one keep their results; the failing step and the ones after it show why.
  const now = evaluatePartial(model, values);
  const error = now.error ? { stepId: now.error.stepId, message: now.error.message } : undefined;
  return (
    <ol data-block="Derivation" className="m-0 mt-7 list-none p-0">
      {steps.map((step, i) => (
        <StepItem key={step.id} step={step} index={i} model={model} values={values} now={now.results} base={base} error={error} />
      ))}
    </ol>
  );
}

