"use client";

import { memo, useMemo } from "react";
import { Handle, Position, ReactFlow, Background, Controls, MiniMap, type NodeProps } from "@xyflow/react";
import { Database, FolderOpen, UserRound } from "lucide-react";
import type { Asset } from "@/lib/types";
import { assets, relationships } from "@/lib/mock-data";
import { getAttackPathLayout } from "@/lib/graph-layout";

const typeMeta = {
  identity: { Icon: UserRound, label: "USER / IDENTITY", color: "node-identity" },
  share: { Icon: FolderOpen, label: "RESOURCE / SHARE", color: "node-share" },
  database: { Icon: Database, label: "DATASTORE / DB", color: "node-database" },
};

function AssetNode({ data }: NodeProps) {
  const asset = data.asset as Asset;
  const { Icon, label, color } = typeMeta[asset.type];
  return (
    <div className={`asset-node ${color}`}>
      <Handle type="target" position={Position.Top} />
      <div className="asset-node-top"><span className="asset-icon"><Icon size={15} /></span><span>{label}</span><i /></div>
      <strong>{asset.name}</strong><small>{asset.description}</small>
      <div className="asset-node-risk">{asset.riskLabel}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { asset: memo(AssetNode) };

export function AttackGraph() {
  const { nodes, edges } = useMemo(() => getAttackPathLayout(assets, relationships), []);
  return (
    <div className="graph-canvas">
      <div className="graph-status"><span className="status-dot" /> LIVE ATTACK PATH <span className="graph-status-divider" /> {nodes.length} ENTITIES</div>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.45} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag zoomOnScroll zoomOnPinch attributionPosition="top-right">
        <Background color="#233144" gap={22} size={1} />
        <Controls showInteractive={false} />
        <MiniMap nodeColor={(node) => {
          const asset = node.data.asset as Asset;
          return asset.type === "identity" ? "#fb7185" : asset.type === "share" ? "#fbbf24" : "#f43f5e";
        }} maskColor="rgba(2, 6, 23, 0.7)" />
      </ReactFlow>
      <div className="graph-legend"><span><i className="legend-dot legend-red" /> Identity</span><span><i className="legend-dot legend-amber" /> Resource</span><span><i className="legend-dot legend-rose" /> Datastore</span></div>
    </div>
  );
}
