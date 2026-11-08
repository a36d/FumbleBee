"use client";

import { memo, useMemo } from "react";
import { Handle, Position, ReactFlow, Background, Controls, MiniMap, type Edge, type Node, type NodeMouseHandler, type NodeProps } from "@xyflow/react";
import { Database, FolderOpen, UserRound } from "lucide-react";
import type { Asset } from "@/lib/types";

const typeMeta = {
  identity: { Icon: UserRound, label: "USER / IDENTITY", color: "asset-identity" },
  share: { Icon: FolderOpen, label: "RESOURCE / SHARE", color: "asset-resource" },
  resource: { Icon: FolderOpen, label: "RESOURCE / SHARE", color: "asset-resource" },
  database: { Icon: Database, label: "DATASTORE / DB", color: "asset-database" },
};

function AssetNode({ data }: NodeProps) {
  const asset = data.asset as Asset;
  const { Icon, label, color } = typeMeta[asset.type];
  const risk = asset.riskLabel.toLowerCase();
  return (
    <div className={`asset-node ${color} node-risk-${risk}`}>
      <Handle type="target" position={Position.Top} />
      <div className="asset-node-top"><span className="asset-icon"><Icon size={15} /></span><span>{label}</span><i /></div>
      <strong>{asset.name}</strong><small>{asset.description}</small>
      <div className="asset-node-risk">{asset.riskLabel}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { asset: memo(AssetNode) };

interface AttackGraphProps {
  nodes: Node[];
  edges: Edge[];
  highRiskOnly: boolean;
  onNodeClick: NodeMouseHandler;
}

function isHighRiskNode(node: Node): boolean {
  const asset = node.data.asset as Asset | undefined;
  const riskLabel = asset?.riskLabel.toLowerCase();
  return riskLabel === "high" || riskLabel === "critical";
}

export function AttackGraph({ nodes, edges, highRiskOnly, onNodeClick }: AttackGraphProps) {
  const visibleNodeIds = useMemo(
    () => new Set(nodes.filter((node) => !highRiskOnly || isHighRiskNode(node)).map((node) => node.id)),
    [highRiskOnly, nodes],
  );
  const displayNodes = useMemo(
    () => nodes.map((node) => ({ ...node, hidden: !visibleNodeIds.has(node.id) })),
    [nodes, visibleNodeIds],
  );
  const displayEdges = useMemo(
    () => edges.map((edge) => ({
      ...edge,
      hidden: !visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target),
    })),
    [edges, visibleNodeIds],
  );

  return (
    <div className="graph-canvas">
      <div className="graph-status"><span className="status-dot" /> LIVE ATTACK PATH <span className="graph-status-divider" /> {visibleNodeIds.size} ENTITIES</div>
      <ReactFlow key={nodes.map(({ id }) => id).join(":")} nodes={displayNodes} edges={displayEdges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.45} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} onNodeClick={onNodeClick} panOnDrag zoomOnScroll zoomOnPinch attributionPosition="top-right">
        <Background color="#3c686d" gap={22} size={1} />
        <Controls showInteractive={false} />
        <MiniMap position="top-right" nodeColor={(node) => {
          const asset = node.data.asset as Asset;
          return asset.type === "identity" ? "#1d5057" : asset.type === "share" || asset.type === "resource" ? "#d5bb52" : "#88a9aa";
        }} maskColor="rgba(16, 47, 53, 0.7)" />
      </ReactFlow>
      <div className="graph-legend"><span><i className="legend-dot legend-red" /> Identity</span><span><i className="legend-dot legend-amber" /> Resource</span><span><i className="legend-dot legend-rose" /> Datastore</span></div>
    </div>
  );
}
