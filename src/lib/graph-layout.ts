import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import type { Asset, Relationship } from "@/lib/types";

const nodeWidth = 238;
const nodeHeight = 88;

export function getAttackPathLayout(assets: Asset[], relationships: Relationship[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "TB", nodesep: 36, ranksep: 58, marginx: 24, marginy: 24 });

  assets.forEach((asset) => graph.setNode(asset.id, { width: nodeWidth, height: nodeHeight }));
  relationships.forEach((relationship) => graph.setEdge(relationship.sourceId, relationship.targetId));
  dagre.layout(graph);

  const nodes: Node[] = assets.map((asset) => {
    const position = graph.node(asset.id);
    return {
      id: asset.id,
      type: "asset",
      position: { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 },
      data: { asset },
      draggable: false,
      selectable: false,
      connectable: false,
    };
  });

  const edges: Edge[] = relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.sourceId,
    target: relationship.targetId,
    label: relationship.label,
    type: "smoothstep",
    animated: true,
    selectable: false,
    style: { stroke: "#475569", strokeWidth: 1.5 },
    labelStyle: { fill: "#94a3b8", fontSize: 10, fontWeight: 600 },
    labelBgStyle: { fill: "#0f172a", fillOpacity: 1 },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 4,
  }));

  return { nodes, edges };
}
