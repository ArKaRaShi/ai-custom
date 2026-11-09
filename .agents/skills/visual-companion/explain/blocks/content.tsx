/** Static content blocks: Quiz (guess, then reveal), Evidence and Compare tables, and a small bar Chart. */
import { cn } from "cn";
import { Check, CircleHelp, X } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import type { z } from "zod";
import type { BLOCK_PROPS } from "@/catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Props<K extends keyof typeof BLOCK_PROPS> = z.infer<(typeof BLOCK_PROPS)[K]>;

export function Quiz({ question, options, answer, why }: Props<"Quiz">) {
  const [picked, setPicked] = useState<number | null>(null);
  const done = picked !== null;
  const right = picked === answer;
  return (
    <Card data-block="Quiz" className="gap-4 px-6">
      <p className="m-0 flex items-start gap-2 text-[19px] font-semibold">
        <CircleHelp aria-hidden className="mt-1 size-5 shrink-0 text-primary" />
        {question}
      </p>
      <fieldset className="m-0 grid gap-2.5 border-0 p-0">
        <legend className="sr-only">Choices</legend>
        {options.map((option, i) => {
          const isAnswer = done && i === answer;
          const isWrongPick = done && i === picked && !right;
          return (
            <Button
              key={option}
              variant="outline"
              data-option={i}
              data-result={isAnswer ? "right" : isWrongPick ? "wrong" : undefined}
              disabled={done}
              onClick={() => setPicked(i)}
              className={cn(
                "h-auto justify-start gap-3 rounded-xl px-3.5 py-3 text-left text-base font-normal whitespace-normal disabled:opacity-100",
                isAnswer && "border-secondary-foreground bg-secondary text-secondary-foreground",
                isWrongPick && "border-destructive bg-destructive/10",
                done && !isAnswer && !isWrongPick && "opacity-50",
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-sm font-bold">
                {isAnswer ? (
                  <Check aria-label="Correct" className="size-4" />
                ) : isWrongPick ? (
                  <X aria-label="Your pick" className="size-4" />
                ) : (
                  String.fromCharCode(65 + i)
                )}
              </span>
              {option}
            </Button>
          );
        })}
      </fieldset>
      {done && (
        <p data-quiz-why className={cn("m-0 rounded-lg px-3.5 py-3", right ? "bg-secondary" : "bg-destructive/10")}>
          <b>{right ? "Correct." : "Not quite."}</b> {why}
        </p>
      )}
    </Card>
  );
}

export function Evidence({ rows }: Props<"Evidence">) {
  return (
    <Card data-block="Evidence" className="py-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Claim</TableHead>
            <TableHead>Value</TableHead>
            <TableHead className="pr-5">Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.claim}|${row.source}`} data-inferred={row.inferred || undefined}>
              <TableCell className="pl-5 whitespace-normal">
                {row.claim}
                {row.inferred && (
                  <Badge variant="outline" className="ml-2 border-dashed text-muted-foreground">
                    Inference
                  </Badge>
                )}
              </TableCell>
              <TableCell className="font-semibold">{row.value}</TableCell>
              <TableCell className="pr-5 font-mono text-xs whitespace-normal text-muted-foreground">{row.source}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export function Compare({ before, after, rows }: Props<"Compare">) {
  return (
    <Card data-block="Compare" className="py-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5" />
            <TableHead>{before}</TableHead>
            <TableHead className="pr-5 text-primary">{after}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label} data-changed={row.before !== row.after || undefined}>
              <TableCell className="pl-5 font-medium whitespace-normal">{row.label}</TableCell>
              <TableCell className="whitespace-normal text-muted-foreground">{row.before}</TableCell>
              <TableCell className={cn("pr-5 whitespace-normal", row.before !== row.after && "font-semibold text-primary")}>{row.after}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

const TONE_COLOR = { neutral: "var(--primary)", good: "var(--secondary-foreground)", bad: "var(--destructive)" } as const;
const chartConfig = { value: { label: "Value" } } satisfies ChartConfig;

export function Chart({ unit, bars }: Props<"Chart">) {
  // Show the spec's numbers exactly: a chart value is data the author wrote, not a computed result to round.
  const label = (value: unknown) =>
    typeof value === "number" ? `${value.toLocaleString("en-US", { maximumFractionDigits: 20 })}${unit ? ` ${unit}` : ""}` : "";
  return (
    <Card data-block="Chart" className="px-5">
      <ChartContainer config={chartConfig} className="w-full" style={{ height: `${bars.length * 44 + 16}px` }}>
        <BarChart data={bars} layout="vertical" margin={{ left: 0, right: 80, top: 0, bottom: 0 }}>
          <XAxis type="number" dataKey="value" hide />
          <YAxis type="category" dataKey="label" width={150} tickLine={false} axisLine={false} />
          <Bar dataKey="value" radius={6} isAnimationActive={false}>
            {bars.map((bar) => (
              <Cell key={bar.label} fill={TONE_COLOR[bar.tone]} />
            ))}
            <LabelList dataKey="value" position="right" formatter={label} className="fill-foreground" fontSize={13} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <ul className="sr-only" data-chart-values>
        {bars.map((bar) => (
          <li key={bar.label}>
            {bar.label}: {label(bar.value)}
          </li>
        ))}
      </ul>
    </Card>
  );
}
