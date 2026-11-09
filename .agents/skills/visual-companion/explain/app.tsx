/** Browser entry: draws the embedded render spec with json-render. */
import { defineCatalog, type Spec } from "@json-render/core";
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { cn } from "cn";
import katex from "katex";
import { BookOpen, Code2, Lightbulb, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Derivation } from "@/blocks/derivation";
import { Playground } from "@/blocks/playground";
import { AnswerProps, BLOCK_PROPS, LessonProps, SectionProps } from "@/catalog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import "./styles.css";

const catalog = defineCatalog(schema, {
  components: {
    Lesson: { props: LessonProps, description: "Page root with the section rail" },
    Answer: { props: AnswerProps, description: "The conclusion, shown first" },
    Section: { props: SectionProps, description: "A page section listed in the rail" },
    Concept: { props: BLOCK_PROPS.Concept, description: "Simple and expert explanation side by side" },
    Playground: { props: BLOCK_PROPS.Playground, description: "Inputs, what-if presets and Reset bound to /inputs" },
    Derivation: { props: BLOCK_PROPS.Derivation, description: "Formula, Substitute and Result steps evaluated live" },
  },
  actions: {},
});

function Tex({ src }: { src: string }) {
  const html = katex.renderToString(src, { throwOnError: false, displayMode: true });
  // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output with trust off; it renders math, never author HTML.
  return <div className="mt-1 overflow-x-auto rounded-lg bg-background p-3" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** One rail entry: a section's anchor id and its heading. */
interface SectionLink {
  id: string;
  title: string;
}

function Rail({ sections, active }: { sections: SectionLink[]; active: string }) {
  return (
    <nav aria-label="Sections" className="fixed top-1/2 left-1 z-40 flex -translate-y-1/2 flex-col gap-2.5 md:left-3.5">
      {sections.map((s, i) => {
        const on = s.id === active;
        return (
          <Tooltip key={s.id}>
            <TooltipTrigger asChild>
              <a
                href={`#${s.id}`}
                aria-label={`${i + 1}. ${s.title}`}
                aria-current={on ? "location" : undefined}
                data-on={on || undefined}
                className="group flex h-3.5 items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span
                  className={cn(
                    "block h-[3px] w-3.5 rounded-sm bg-muted-foreground/50 transition-all group-hover:w-5 group-hover:bg-muted-foreground group-focus-visible:w-5 motion-reduce:transition-none",
                    on && "w-6.5 bg-gradient-to-r from-primary to-primary-2 group-hover:w-6.5",
                  )}
                />
              </a>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>{`${i + 1}. ${s.title}`}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

function Lesson({ title, subtitle, children }: { title: string; subtitle: string | undefined; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [sections, setSections] = useState<SectionLink[]>([]);
  const [active, setActive] = useState("");
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const nodes = [...(ref.current?.querySelectorAll<HTMLElement>("section[data-rail]") ?? [])];
    const links = nodes.map((n) => ({ id: n.id, title: n.dataset.rail ?? "" }));
    setSections(links);
    // The active section is the last one whose top has passed 30% of the viewport;
    // at the bottom of the page it is the last section, so short final sections can still be reached.
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? window.scrollY / max : 0);
      const atBottom = max > 0 && window.scrollY >= max - 2;
      const passed = nodes.filter((n) => n.getBoundingClientRect().top <= window.innerHeight * 0.3);
      const current = atBottom ? nodes.at(-1) : (passed.at(-1) ?? nodes[0]);
      setActive(current?.id ?? "");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return (
    <TooltipProvider delayDuration={100}>
      <div
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-gradient-to-r from-primary to-primary-2"
        style={{ transform: `scaleX(${progress})` }}
      />
      <Rail sections={sections} active={active} />
      <main ref={ref} className="mx-auto max-w-[820px] pt-12 pr-4 pb-30 pl-7 md:px-6">
        <header>
          <p className="m-0 inline-flex items-center gap-1.5 text-xs font-semibold tracking-[.14em] text-primary uppercase">
            <BookOpen size={14} aria-hidden />
            Explain
          </p>
          <h1 className="mt-2 mb-3 text-3xl leading-tight font-bold tracking-tight md:text-[40px]">{title}</h1>
          {subtitle && <p className="mt-0 mb-7 text-lg text-muted-foreground">{subtitle}</p>}
        </header>
        {children}
      </main>
    </TooltipProvider>
  );
}

const { registry } = defineRegistry(catalog, {
  components: {
    Lesson: ({ props, children }) => (
      <Lesson title={props.title} subtitle={props.subtitle}>
        {children}
      </Lesson>
    ),
    Answer: ({ props }) => (
      <Card data-block="Answer" className="gap-1.5 bg-gradient-to-br from-accent to-card px-6">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-[.08em] text-primary uppercase">
          <Sparkles size={14} aria-hidden />
          Answer
        </span>
        <p className="m-0 text-[19px] leading-normal">{props.text}</p>
      </Card>
    ),
    Section: ({ props, children }) => (
      <section id={props.id} data-rail={props.title} className="mt-18 scroll-mt-8">
        <h2 className="mt-0 mb-5 text-[28px] font-bold tracking-tight">{props.title}</h2>
        {children}
      </section>
    ),
    Concept: ({ props }) => (
      <div data-block="Concept" className="grid gap-4 md:grid-cols-2">
        <Card className="gap-3 px-5 py-5">
          <Badge variant="secondary">
            <Lightbulb aria-hidden />
            Simple
          </Badge>
          <p className="m-0">{props.simple}</p>
        </Card>
        <Card className="min-w-0 gap-3 px-5 py-5">
          <Badge>
            <Code2 aria-hidden />
            Expert
          </Badge>
          <p className="m-0">{props.expert}</p>
          {props.tex && <Tex src={props.tex} />}
        </Card>
      </div>
    ),
    Playground: ({ props }) => <Playground presets={props.presets} />,
    Derivation: ({ props }) => <Derivation steps={props.steps} />,
  },
});

// The CLI validated the lesson and built this spec, so the page trusts its shape.
const specText = document.getElementById("spec")?.textContent ?? "{}";
const spec: Spec = JSON.parse(specText);
const container = document.getElementById("app");
if (container) {
  createRoot(container).render(
    <JSONUIProvider registry={registry} initialState={spec.state ?? {}}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>,
  );
}
