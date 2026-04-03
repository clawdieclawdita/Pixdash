# Agent Panel Component Test Guide

This file describes how to verify the AgentPanel component renders correctly with mock data.

## Quick Verification

Since the backend (Track 4) is not yet complete, you can test the components with mock data by:

### Option 1: Create a test component

```tsx
// src/App.tsx (for testing purposes)

import { AgentPanel } from './components/ui/AgentPanel';
import { useAgentsStore } from './store/agentsStore';
import { useEffect } from 'react';

function MockAgentTest() {
  const setAgents = useAgentsStore((state) => state.setAgents);
  const selectAgent = useAgentsStore((state) => state.selectAgent);
  const { panelOpen, openPanel } = useUIStore((state) => ({
    panelOpen: state.panelOpen,
    openPanel: state.openPanel,
  }));

  useEffect(() => {
    // Mock agent data
    const mockAgent = {
      id: 'agent:devo:telegram:group:-1003723628918',
      name: 'Devo',
      status: 'online' as const,
      lastSeen: new Date().toISOString(),
      position: { x: 5, y: 8, direction: 'east' as const },
      appearance: {
        bodyType: 'male' as const,
        hair: { style: 'short' as const, color: '#2C1810' },
        skinColor: '#E8BEAC',
        outfit: { type: 'casual' as const, color: '#3B5998' },
      },
      config: {
        model: 'zai/glm-5',
        channel: 'telegram',
        workspace: '/home/pschivo/.openclaw/workspace-devo',
      },
      stats: {
        messagesProcessed: 1234,
        tasksCompleted: 56,
        uptimeSeconds: 86400,
      },
    };

    // Set mock agent and select it
    setAgents([mockAgent]);
    selectAgent(mockAgent.id);
    openPanel();
  }, [setAgents, selectAgent, openPanel]);

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <h1 className="text-white text-2xl font-bold mb-4">PixDash Agent Panel Test</h1>
      <p className="text-gray-400 mb-4">Agent panel should slide in from the right</p>
      <AgentPanel />
    </div>
  );
}

export default MockAgentTest;
```

### Option 2: Test individual components

```tsx
// src/components/ui/__tests__/AgentStatus.test.tsx
import { render, screen } from '@testing-library/react';
import { AgentStatus } from '../AgentStatus';

describe('AgentStatus', () => {
  it('renders online status with pulse animation', () => {
    render(<AgentStatus status="online" />);
    expect(screen.getByText('Online')).toBeInTheDocument();
    // Check for green dot with pulse
    const dot = screen.getByRole('status'); // or use testId
    expect(dot).toHaveClass('bg-emerald-500');
  });

  it('renders offline status without pulse', () => {
    render(<AgentStatus status="offline" />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });
});
```

### Option 3: Manual visual inspection

1. Start the dev server: `pnpm --filter frontend dev`
2. Open browser to `http://localhost:5173`
3. If App.tsx includes the mock test component, verify:
   - ✅ Agent panel slides in from the right
   - ✅ Dark semi-transparent background with backdrop blur
   - ✅ Agent name and status displayed correctly
   - ✅ Tabs (Status | Config | Logs | Tasks) work
   - ✅ Status tab shows current status and position
   - ✅ Config tab shows configuration and statistics
   - ✅ Logs tab shows log entries with filtering
   - ✅ Tasks tab shows task list with status badges
   - ✅ Close button closes the panel
   - ✅ Customize button is present (will open modal once Track 3's CustomizerModal is integrated)

## Component Structure

```
AgentPanel (slide-in sidebar)
├── Header (name, status, close button, customize button)
└── Tabs
    ├── Status tab
    │   ├── Current status section
    │   └── Position section
    ├── Config tab
    │   └── ConfigViewer component
    ├── Logs tab
    │   └── LogViewer component
    └── Tasks tab
        └── TaskViewer component
```

## Dependencies

All components assume the following shadcn/ui primitives are available:

- Button (`@/components/ui/button`)
- Tabs (`@/components/ui/tabs`)
- Badge (`@/components/ui/badge`)
- ScrollArea (`@/components/ui/scroll-area`)
- Separator (`@/components/ui/separator`)
- Dialog (`@/components/ui/dialog`) - for CustomizerModal (Track 3)

## TypeScript Compilation

All components use TypeScript strict mode. To verify compilation:

```bash
cd pixdash/packages/frontend
npx tsc --noEmit
```

Note: This may fail until the shared package types are properly set up and all shadcn/ui primitives are installed.

## Integration with Backend

Once Track 4 (WebSocket bridge) is complete:

1. The WebSocket connection in `useWebSocket.ts` will automatically connect
2. Agent data will be populated from the `sync` response
3. Real-time updates will be dispatched to stores via event handlers
4. Logs and tasks will be fetched via REST API when panel opens

## Design Notes

- Follows modern game UI overlay aesthetic (not admin dashboard)
- Dark semi-transparent backgrounds (`bg-black/80`, `backdrop-blur-xl`)
- Subtle borders (`border-white/10`)
- Crisp typography with proper hierarchy
- Status colors: online (green), idle (yellow), busy (red), offline (gray)
- Animated pulse ring for online/busy states
- Empty states for logs and tasks when no data available
