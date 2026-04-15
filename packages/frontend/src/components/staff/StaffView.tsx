import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dagre from 'dagre';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAgentsStore, type StoreAgent } from '@/store/agentsStore';
import { AgentNodeCard } from './AgentNodeCard';

const CARD_WIDTH = 260;
const CARD_HEIGHT = 88;
const ROLE_MAP: Record<string, string> = {
  main: 'CEO',
  devo: 'CDO',
  cornelio: 'CISO',
  infralover: 'IM',
  docclaw: 'DM',
  forbidden: 'Analyst',
};

const ORG_EDGES = [
  { id: 'main-devo', source: 'main', target: 'devo' },
  { id: 'main-cornelio', source: 'main', target: 'cornelio' },
  { id: 'devo-infralover', source: 'devo', target: 'infralover' },
  { id: 'devo-docclaw', source: 'devo', target: 'docclaw' },
  { id: 'infralover-forbidden', source: 'infralover', target: 'forbidden' },
] as const;

const defaultEdgeOptions = {
  type: 'smoothstep',
  style: { stroke: 'rgba(209, 164, 90, 0.4)', strokeWidth: 1.5 },
  animated: false,
};

const nodeTypes: NodeTypes = {
  agent: AgentNodeCard,
};

type AgentFlowNode = Node<{ agent: StoreAgent; role: string }, 'agent'>;

function buildGraph(agents: StoreAgent[]): { nodes: AgentFlowNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100 });

  agents.forEach((agent) => {
    g.setNode(agent.id, { width: CARD_WIDTH, height: CARD_HEIGHT });
  });

  ORG_EDGES.forEach(({ source, target }) => g.setEdge(source, target));
  dagre.layout(g);

  const nodes: AgentFlowNode[] = agents.map((agent) => {
    const position = g.node(agent.id);
    return {
      id: agent.id,
      type: 'agent',
      draggable: false,
      selectable: false,
      position: {
        x: position.x - CARD_WIDTH / 2,
        y: position.y - CARD_HEIGHT / 2,
      },
      data: {
        agent,
        role: ROLE_MAP[agent.id] ?? agent.title ?? 'Agent',
      },
    };
  });

  const edges: Edge[] = ORG_EDGES.map((edge) => ({ ...edge }));

  return { nodes, edges };
}

function StaffFlow({ initialNodes, initialEdges }: { initialNodes: AgentFlowNode[]; initialEdges: Edge[] }) {
  const reactFlow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const hasFitted = useRef(false);

  // Update node data (agent status/bodyType) without changing positions
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const updated = initialNodes.find((in_) => in_.id === n.id);
        if (updated && updated.data.agent !== n.data.agent) {
          return { ...n, data: updated.data };
        }
        return n;
      }),
    );
  }, [initialNodes, setNodes]);

  // Fit only once on mount
  useEffect(() => {
    if (!hasFitted.current) {
      hasFitted.current = true;
      requestAnimationFrame(() => {
        reactFlow.fitView({ padding: 0.15, duration: 300 });
      });
    }
  }, [reactFlow]);

  const fitToView = useCallback(() => {
    requestAnimationFrame(() => {
      reactFlow.fitView({ padding: 0.15, duration: 300 });
    });
  }, [reactFlow]);

  return (
    <>
      <button
        type="button"
        onClick={fitToView}
        className="absolute right-6 top-[5.75rem] z-20 flex items-center gap-2 rounded-xl border border-[#d1a45a]/25 bg-[#15110d]/90 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f0d6a5] shadow-[0_0_18px_rgba(209,164,90,0.16)] backdrop-blur-sm transition hover:border-[#d1a45a]/45 hover:bg-[#1b1611]"
      >
        <span className="text-xs leading-none">⌘</span>
        Fit
      </button>

      <ReactFlow
        nodes={nodes}
        edges={initialEdges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.45}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent"
      >
        <Background color="rgba(209, 164, 90, 0.08)" gap={24} size={1} />
        <Controls
          showInteractive={false}
          className="!bottom-6 !left-6 !top-auto !rounded-xl !border !border-[#d1a45a]/20 !bg-[#15110d]/90 !shadow-[0_0_18px_rgba(209,164,90,0.1)] [&_button]:!border-b-[#d1a45a]/10 [&_button]:!bg-transparent [&_button]:!text-[#f0d6a5] hover:[&_button]:!bg-[#1b1611]"
        />
      </ReactFlow>
    </>
  );
}

export function StaffView() {
  const { agents } = useAgentsStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const visibleAgents = useMemo(() => {
    const orgIds = new Set(Object.keys(ROLE_MAP));
    return agents.filter((agent) => orgIds.has(agent.id));
  }, [agents]);

  const { nodes, edges } = useMemo(() => buildGraph(visibleAgents), [visibleAgents]);

  return (
    <div className="relative min-h-[70vh] overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,16,18,0.92),rgba(11,11,14,0.95))] shadow-panel shadow-black/30">
      <div className="pointer-events-none absolute inset-0 z-10 bg-[repeating-linear-gradient(0deg,transparent,transparent_3px,rgba(0,0,0,0.03)_3px,rgba(0,0,0,0.03)_4px)]" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.3)_100%)]" />

      <div className="relative z-20 border-b border-[#d1a45a]/15 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#d1a45a]/60">
              Command Center
            </p>
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">
              Staff Hierarchy
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#9c907f]">
              {visibleAgents.filter((a) => a.status !== 'offline').length}/{visibleAgents.length} online
            </span>
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#6dbd72]" />
          </div>
        </div>
      </div>

      <div className="relative z-0 h-[calc(70vh-89px)] min-h-[520px] w-full" style={{ backgroundColor: '#0d0c0e' }}>
        {mounted ? (
          <ReactFlowProvider>
            <StaffFlow initialNodes={nodes} initialEdges={edges} />
          </ReactFlowProvider>
        ) : null}
      </div>
    </div>
  );
}
