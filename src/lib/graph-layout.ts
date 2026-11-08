import dagre from "dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";

const defaultNodeWidth = 238;
const defaultNodeHeight = 96;

export function getAttackPathLayout(nodes: Node[], edges: Edge[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "TB", nodesep: 36, ranksep: 58, marginx: 24, marginy: 24 });

  nodes.forEach((node) => graph.setNode(node.id, {
    width: node.width ?? defaultNodeWidth,
    height: node.height ?? defaultNodeHeight,
  }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);

  const layoutNodes = nodes.map((node) => {
    const position = graph.node(node.id);
    const width = node.width ?? defaultNodeWidth;
    const height = node.height ?? defaultNodeHeight;
    return {
      ...node,
      type: node.type ?? "asset",
      position: { x: position.x - width / 2, y: position.y - height / 2 },
      draggable: false,
      selectable: false,
      connectable: false,
    };
  });

  const layoutEdges = edges.map((edge) => ({
    ...edge,
    type: edge.type ?? "smoothstep",
    animated: edge.animated ?? true,
    selectable: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#d5bb52", width: 16, height: 16 },
    style: { stroke: "#d5bb52", strokeWidth: 2, ...edge.style },
    labelStyle: { fill: "#d5bb52", fontSize: 10, fontWeight: 600, ...edge.labelStyle },
    labelBgStyle: { fill: "#102f35", fillOpacity: 1, ...edge.labelBgStyle },
    labelBgPadding: edge.labelBgPadding ?? [6, 3],
    labelBgBorderRadius: edge.labelBgBorderRadius ?? 4,
  }));

  return { nodes: layoutNodes, edges: layoutEdges };
}
