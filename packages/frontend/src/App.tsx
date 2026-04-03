import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { getOfficeLayout, type OfficeLayout } from '@/lib/api';
import { useAgents } from '@/hooks/useAgents';
import type { AgentPosition, TilemapData } from '@/types';

function normalizeTilemap(layout: OfficeLayout): TilemapData {
  return {
    version: 1,
    width: layout.width,
    height: layout.height,
    tileSize: layout.tileSize,
    layers: {
      floor: layout.layers.floor ?? [],
      furniture: layout.layers.furniture ?? [],
      walls: layout.layers.walls ?? []
    },
    spawnPoints: layout.spawnPoints ?? [],
    walkable: layout.walkable ?? []
  };
}

function App() {
  const { agents, isLoading: agentsLoading, error: agentsError, connectionState, socketError } = useAgents();
  const [tilemap, setTilemap] = useState<TilemapData | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [isLayoutLoading, setIsLayoutLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadOfficeLayout = async () => {
      try {
        const layout = await getOfficeLayout();

        if (mounted) {
          setTilemap(normalizeTilemap(layout));
          setLayoutError(null);
        }
      } catch (error) {
        if (mounted) {
          setTilemap(null);
          setLayoutError(error instanceof Error ? error.message : 'Failed to load office layout');
        }
      } finally {
        if (mounted) {
          setIsLayoutLoading(false);
        }
      }
    };

    void loadOfficeLayout();

    return () => {
      mounted = false;
    };
  }, []);

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
        appearance: agent.appearance
      })),
    [agents]
  );

  return (
    <AppLayout
      tilemap={tilemap}
      agents={canvasAgents}
      isAgentsLoading={agentsLoading}
      isLayoutLoading={isLayoutLoading}
      agentsError={agentsError}
      layoutError={layoutError}
      connectionState={connectionState}
      socketError={socketError}
    />
  );
}

export default App;
