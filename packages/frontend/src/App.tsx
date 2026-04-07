import { useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAgents } from '@/hooks/useAgents';
import type { AgentPosition } from '@/types';

function App() {
  const { agents, isLoading: agentsLoading, error: agentsError, connectionState, socketError } = useAgents();

  const canvasAgents = useMemo<AgentPosition[]>(
    () =>
      agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        x: agent.x,
        y: agent.y,
        color: agent.color,
        status: agent.status,
        direction: agent.position.direction,
        appearance: agent.appearance,
        movementState: agent.movementState,
        targetX: agent.targetX,
        targetY: agent.targetY,
        path: agent.path,
        claimedWaypointId: agent.claimedWaypointId,
      })),
    [agents]
  );

  return (
    <AppLayout
      agents={canvasAgents}
      isAgentsLoading={agentsLoading}
      agentsError={agentsError}
      connectionState={connectionState}
      socketError={socketError}
    />
  );
}

export default App;
