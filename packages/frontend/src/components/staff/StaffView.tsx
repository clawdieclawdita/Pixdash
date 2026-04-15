import { useEffect, useMemo, useRef, useState } from 'react';
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
  style: { stroke: 'rgba(209, 164, 90, 0.55)', strokeWidth: 2 },
  animated: false,
};

const nodeTypes: NodeTypes = {
  agent: AgentNodeCard,
};

type AgentFlowNode = Node<{ agent: StoreAgent; role: string }, 'agent'>;

function buildGraph(agents: StoreAgent[]): { nodes: AgentFlowNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 });

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
        reactFlow.fitView({ padding: 0.08, duration: 300 });
      });
    }
  }, [reactFlow]);

  return (
    <>
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
        <Background color="rgba(209, 164, 90, 0.05)" gap={20} size={1} />
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
  const [fitSignal, setFitSignal] = useState(0);

  return (
    <div className="pixel-frame crt-panel relative min-h-[70vh] overflow-hidden rounded-[18px] bg-[linear-gradient(180deg,rgba(15,12,16,0.98),rgba(9,8,11,0.98))]">

      <div className="relative z-20 border-b border-[#d1a45a]/15 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#d1a45a]/60">
              Command Center
            </p>
            <h2 className="font-display text-xl leading-relaxed text-white md:text-2xl">
              Staff Hierarchy
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="pixel-frame rounded-[10px] bg-[#130f13]/90 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#9c907f]">
              {visibleAgents.filter((a) => a.status !== 'offline').length}/{visibleAgents.length} online
            </span>
            <span className="h-2.5 w-2.5 animate-pulse border border-[#2a2520] bg-[#00d4aa]" />
            <button
              type="button"
              onClick={() => setFitSignal((value) => value + 1)}
              className="pixel-button flex items-center gap-2 rounded-[10px] bg-[#15110d]/90 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#f0d6a5] transition hover:brightness-110"
            >
              <span className="text-xs leading-none">⌘</span>
              Fit
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-0 h-[calc(70vh-89px)] min-h-[520px] w-full" style={{ backgroundColor: '#0d0c0e' }}>
        {mounted ? (
          <ReactFlowProvider>
            <StaffFlowWithSignal initialNodes={nodes} initialEdges={edges} fitSignal={fitSignal} />
          </ReactFlowProvider>
        ) : null}
      </div>
    </div>
  );
}

function StaffFlowWithSignal({ initialNodes, initialEdges, fitSignal }: { initialNodes: AgentFlowNode[]; initialEdges: Edge[]; fitSignal: number }) {
  const reactFlow = useReactFlow();

  useEffect(() => {
    if (fitSignal === 0) return;
    requestAnimationFrame(() => {
      reactFlow.fitView({ padding: 0.08, duration: 300 });
    });
  }, [fitSignal, reactFlow]);

  return <StaffFlow initialNodes={initialNodes} initialEdges={initialEdges} />;
}
