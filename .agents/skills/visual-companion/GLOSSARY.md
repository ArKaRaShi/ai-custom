# Visual companion diagrams

How a reader explores a diagram on a companion screen: what the diagram is made of, how it is laid out, and how it highlights parts of itself.

## Language

**Diagram**:
One `vc-diagram` on a screen: a graph drawn as boxes and lines, whether laid out from text or drawn by hand.
_Avoid_: Chart (a chart plots numbers), figure, picture

**Diagram kind**:
The layout family a text-source diagram declares on its first line: flow, tree, sequence or state. Flow applies when it declares none.
_Avoid_: Diagram type, mode (mode means highlight mode)

**Graph**:
The nodes and edges of a diagram, read once from its markup. Reach, step focus and term links work on the graph, not on pixels.
_Avoid_: Model, structure

**Node**:
One named box in a diagram, identified by a stable id.
_Avoid_: Box, block, component (a component is a catalogue entry)

**Edge**:
A directed line from one node to another.
_Avoid_: Arrow, connector, link

**Edge kind**:
What an edge means: default, emphasis, return, async or security. Shown by line shape, never by colour alone.
_Avoid_: Line style, edge type

**Reply**:
An edge of kind return: a response travelling back along a path. It is not a dependency, so reach skips it.
_Avoid_: Back edge

**Reach**:
The nodes upstream ("what feeds this") or downstream ("what this feeds") of a selected node, each with its hop distance (depth).
_Avoid_: Trace, impact

**Step focus**:
The nodes a selected tab lights while the rest dim.
_Avoid_: Spotlight, highlight step

**Highlight mode**:
The one state a diagram is in at a time: idle, reach or step.
_Avoid_: Diagram state

**Term link**:
The two-way tie between a `vc-term` and the node it names: lighting one lights the other.
_Avoid_: Cross-link

**Budget**:
The part count above which a diagram reports that it should be split.
_Avoid_: Limit, cap

**Geometry rule**:
A check on a text-source diagram's own drawing that keeps its lines readable. The diagram reports any rule it cannot meet on-screen.
_Avoid_: Layout constraint, lint rule
