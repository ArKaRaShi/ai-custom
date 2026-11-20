/**
 * Diagram block: a JSON graph drawn as one SVG. elkjs ranks and routes it asynchronously,
 * so the block shows a pending line, then the drawing, or the reason no drawing exists.
 *
 * Choosing a step highlights its focus. Escape clears the node selection.
 */
import { type MouseEvent, useEffect, useId, useMemo, useState } from "react";
import { type DiagramDirection, type DiagramProps, type Graph, PART_BUDGET, readGraph } from "@/diagram/graph";
import { EDGE_LINE_HEIGHT, type LaidGraph, layoutGraph, layoutKey, NODE_LINE_HEIGHT } from "@/diagram/layout";
import "@/diagram/diagram.css";

export function Diagram({ alt, nodes, edges, direction = "LR", steps = [] }: DiagramProps) {
  const graph = useMemo(() => readGraph(nodes, edges, steps), [nodes, edges, steps]);
  // New data means new highlight state: the view is keyed on the graph it was built from.
  const signature = JSON.stringify([graph.nodes, graph.edges, graph.steps]);
  return <DiagramView key={signature} alt={alt} direction={direction} graph={graph} />;
}

type ViewProps = { alt: string; direction: DiagramDirection; graph: Graph };

/** Smallest shrink that still leaves node labels readable; below it the diagram scrolls instead. */
const FIT_FLOOR = 0.85;

function DiagramView({ alt, direction, graph }: ViewProps) {
  const markerId = `diagram-arrow-${useId().replace(/:/g, "")}`;
  const request = useMemo(() => ({ nodes: graph.nodes, edges: graph.edges, direction }), [graph, direction]);
  const key = layoutKey(request);
  const [loaded, setLoaded] = useState<{ key: string; laid: LaidGraph | null; error: string | null }>({ key, laid: null, error: null });
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<number | null>(graph.steps.length ? 0 : null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 0, overflow: false, atEnd: false, left: 0, span: 0 });

  useEffect(() => {
    if (!graph.nodes.length) return;
    // A layout that resolves after the props moved on must not paint: `live` drops it, and
    // the key check below keeps the pending state until the current request lands.
    let live = true;
    const start = async () => {
      const result = await layoutGraph(request);
      if (!live) return;
      setLoaded(result.ok ? { key, laid: result.laid, error: null } : { key, laid: null, error: result.error });
    };
    void start();
    return () => {
      live = false;
    };
  }, [graph.nodes.length, key, request]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!scrollEl) return;
    // Width drives the fit scale; the scroll position drives whether the right-edge fade
    // still has hidden content behind it.
    const sync = () => {
      const width = scrollEl.clientWidth;
      const span = scrollEl.scrollWidth;
      const left = scrollEl.scrollLeft;
      const overflow = span > width + 1;
      const atEnd = left + width >= span - 1;
      setBox((previous) =>
        previous.width === width && previous.overflow === overflow && previous.atEnd === atEnd && previous.left === left && previous.span === span
          ? previous
          : { width, overflow, atEnd, left, span },
      );
    };
    const observer = new ResizeObserver(sync);
    observer.observe(scrollEl);
    scrollEl.addEventListener("scroll", sync, { passive: true });
    sync();
    return () => {
      observer.disconnect();
      scrollEl.removeEventListener("scroll", sync);
    };
  }, [scrollEl]);

  const laid = loaded.key === key ? loaded.laid : null;
  const error = loaded.key === key ? loaded.error : null;
  // Shrink to the column only when the drawing still fits at a legible scale. Below that it
  // keeps full size and the frame scrolls, because 8px labels inside a squeezed SVG are worse
  // than a diagram that scrolls.
  const fits = laid && box.width > 0 && laid.width > box.width && laid.width * FIT_FLOOR <= box.width;
  const scale = fits && laid ? box.width / laid.width : 1;
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const focus = step === null ? null : new Set(graph.steps[step]?.focus ?? []);
  const mode = focus?.size ? "step" : "idle";

  /** Brings the span of nodes into the middle of the frame; a diagram that already fits stays put. */
  function reveal(ids: Iterable<string>) {
    if (!scrollEl || !laid) return;
    const wanted = new Set(ids);
    const spans = laid.nodes.filter((node) => wanted.has(node.id));
    if (!spans.length) return;
    const left = Math.min(...spans.map((node) => node.x)) * scale;
    const right = Math.max(...spans.map((node) => node.x + node.w)) * scale;
    const target = Math.max(0, Math.min((left + right) / 2 - scrollEl.clientWidth / 2, scrollEl.scrollWidth - scrollEl.clientWidth));
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollEl.scrollTo({ left: target, behavior: calm ? "auto" : "smooth" });
  }

  function select(id: string) {
    setSelected(id);
    setStep(null);
    reveal([id]);
  }

  function chooseStep(index: number) {
    setStep(index);
    setSelected(null);
    reveal(graph.steps[index]?.focus ?? []);
  }

  /** Clicking the position bar jumps there, like a scrollbar track. */
  function jump(event: MouseEvent<HTMLDivElement>) {
    if (!scrollEl) return;
    const track = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - track.left) / track.width;
    scrollEl.scrollTo({ left: ratio * scrollEl.scrollWidth - scrollEl.clientWidth / 2, behavior: "smooth" });
  }

  return (
    <section data-block="Diagram" data-dir={direction} data-diagram-mode={mode} className="explain-diagram">
      {graph.steps.length > 0 && (
        <fieldset className="diagram-tools" aria-label="Diagram steps">
          {graph.steps.map((item, index) => (
            <button key={JSON.stringify([item.label, item.focus])} type="button" aria-pressed={step === index} onClick={() => chooseStep(index)}>
              {item.label}
            </button>
          ))}
        </fieldset>
      )}
      {error && <p role="alert">Diagram layout failed: {error}</p>}
      {!error && !graph.nodes.length && <p className="diagram-pending">This diagram has no nodes.</p>}
      {!error && graph.nodes.length > 0 && !laid && <p className="diagram-pending">Laying out diagram…</p>}
      {laid && (
        <div className="diagram-frame" data-overflow={box.overflow ? "" : undefined} data-at-end={box.atEnd ? "" : undefined}>
          <div className="diagram-scroll" ref={setScrollEl}>
            <svg
              className="diagram-canvas"
              viewBox={`0 0 ${laid.width} ${laid.height}`}
              width={Math.round(laid.width * scale)}
              height={Math.round(laid.height * scale)}
            >
              <title>{alt}</title>
              <defs>
                <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
                  <path className="diagram-arrow" d="M 0 0 L 10 5 L 0 10 Z" />
                </marker>
              </defs>
              <g className="diagram-edges">
                {laid.edges.map((edge) => {
                  const lit = focus?.has(edge.source) === true && focus.has(edge.target);
                  return (
                    <path
                      key={edge.id}
                      d={edge.d}
                      data-edge={edge.id}
                      data-from={edge.source}
                      data-to={edge.target}
                      data-step-focus={lit ? "" : undefined}
                      markerEnd={`url(#${markerId})`}
                    />
                  );
                })}
              </g>
              <g className="diagram-edge-labels">
                {laid.edges.map((edge) => {
                  const label = edge.label;
                  if (!label) return null;
                  const left = label.w / 2;
                  const top = label.h / 2 - ((label.lines.length - 1) * EDGE_LINE_HEIGHT) / 2;
                  return (
                    <g key={edge.id} className="diagram-edge-label" transform={`translate(${label.x} ${label.y})`}>
                      <rect width={label.w} height={label.h} rx={4} />
                      <text x={left} y={top} textAnchor="middle" dominantBaseline="middle">
                        {label.lines.map((line, offset) => {
                          const lineY = top + offset * EDGE_LINE_HEIGHT;
                          return (
                            <tspan key={`${line}#${lineY}`} x={left} y={lineY}>
                              {line}
                            </tspan>
                          );
                        })}
                      </text>
                    </g>
                  );
                })}
              </g>
              <g className="diagram-nodes">
                {laid.nodes.map((node) => {
                  const inFocus = focus?.has(node.id) ?? false;
                  return (
                    // biome-ignore lint/a11y/useSemanticElements: an SVG <g> cannot become a <button>; the role plus tabIndex keeps nodes keyboard-operable
                    <g
                      key={node.id}
                      className="diagram-node"
                      transform={`translate(${node.x} ${node.y})`}
                      data-node={node.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${labels.get(node.id) ?? node.id}${mode === "step" && inFocus ? ", highlighted in step" : ""}`}
                      aria-pressed={selected === node.id}
                      data-step-focus={mode === "step" && inFocus ? "" : undefined}
                      onClick={() => select(node.id)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        select(node.id);
                      }}
                    >
                      <rect className="diagram-node-box" width={node.w} height={node.h} rx={10} />
                      <text
                        className="diagram-node-label"
                        x={node.w / 2}
                        y={node.h / 2 - ((node.lines.length - 1) * NODE_LINE_HEIGHT) / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {node.lines.map((line, offset) => {
                          const lineY = node.h / 2 - ((node.lines.length - 1) * NODE_LINE_HEIGHT) / 2 + offset * NODE_LINE_HEIGHT;
                          return (
                            <tspan key={`${line}#${lineY}`} x={node.w / 2} y={lineY}>
                              {line}
                            </tspan>
                          );
                        })}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
          {box.overflow && (
            <div className="diagram-scrollbar" aria-hidden="true" onClick={jump}>
              <div className="diagram-scrollbar-thumb" style={{ width: `${(box.width / box.span) * 100}%`, left: `${(box.left / box.span) * 100}%` }} />
            </div>
          )}
        </div>
      )}
      {graph.problems.length > 0 && <p role="status">{graph.problems.join(" ")}</p>}
      {graph.nodes.length > PART_BUDGET && <p>This diagram has {graph.nodes.length} parts. Consider splitting it.</p>}
    </section>
  );
}
