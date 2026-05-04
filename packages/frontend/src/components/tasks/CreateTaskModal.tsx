import { useEffect, useMemo, useState } from 'react';
import type { UserTask } from '@pixdash/shared';
import { fetchAgentSessions } from '@/lib/api';
import { useAgentsStore } from '@/store/agentsStore';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTask: (task: Omit<UserTask, 'id' | 'createdAt' | 'updatedAt'>) => void | Promise<void>;
}

export function CreateTaskModal({ isOpen, onClose, onCreateTask }: CreateTaskModalProps) {
  const agents = useAgentsStore((state) => state.agents);
  const availableAgents = useMemo(() => agents.slice(0, 6), [agents]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [replySession, setReplySession] = useState('');
  const [sessionOptions, setSessionOptions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!assignedTo) {
      setReplySession('');
      setSessionOptions([]);
      return () => {
        cancelled = true;
      };
    }

    setReplySession('');
    void fetchAgentSessions(assignedTo)
      .then((sessions) => {
        if (!cancelled) {
          setSessionOptions(sessions);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessionOptions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assignedTo]);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setName('');
    setDescription('');
    setAssignedTo('');
    setScheduleMode(false);
    setScheduledAt('');
    setReplySession('');
    setSessionOptions([]);
    onClose();
  };

  const canSubmitBase = name.trim().length > 0 && description.trim().length > 0 && assignedTo.length > 0;

  const handleCreate = (mode: 'running' | 'scheduled') => {
    if (!canSubmitBase) return;
    if (mode === 'scheduled' && !scheduledAt) return;

    onCreateTask({
      name: name.trim(),
      description: description.trim(),
      assignedTo,
      status: mode,
      scheduledAt: mode === 'scheduled' ? new Date(scheduledAt).toISOString() : undefined,
      replySession: replySession || undefined,
      metadata: {},
    });

    resetAndClose();
  };

  const selectedAgent = availableAgents.find((agent) => agent.id === assignedTo);
  const selectedAgentName = selectedAgent?.displayName ?? selectedAgent?.name ?? 'Agent';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="pixel-frame crt-panel w-full max-w-2xl rounded-[18px] bg-[#0f0b10]">
        <div className="flex items-center justify-between border-b border-[#d1a45a]/20 px-6 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#9c907f]">Task Creator</p>
            <h2 className="mt-2 font-display text-lg text-white">Create Task</h2>
          </div>
          <button type="button" onClick={resetAndClose} className="pixel-button rounded-[10px] bg-[#1a140f] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#f0d6a5] transition hover:brightness-110">Cancel</button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.24em] text-[#9c907f]">Task Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="pixel-inset w-full rounded-[10px] bg-[#09070b] px-3 py-2 text-sm text-white outline-none focus:border-[#d1a45a]/50" />
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.24em] text-[#9c907f]">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="pixel-inset w-full rounded-[10px] bg-[#09070b] px-3 py-2 text-sm text-white outline-none focus:border-[#d1a45a]/50" />
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.24em] text-[#9c907f]">Assigned To</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="pixel-inset w-full rounded-[10px] bg-[#09070b] px-3 py-2 text-sm text-white outline-none focus:border-[#d1a45a]/50">
              <option value="">Select an agent</option>
              {availableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.displayName ?? agent.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.24em] text-[#9c907f]">Reply back to</label>
            <select
              value={replySession}
              onChange={(e) => setReplySession(e.target.value)}
              disabled={!assignedTo}
              className="pixel-inset w-full rounded-[10px] bg-[#09070b] px-3 py-2 text-sm text-white outline-none focus:border-[#d1a45a]/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{`${selectedAgentName}'s main chat (OpenClaw UI)`}</option>
              {sessionOptions.map((sessionKey) => (
                <option key={sessionKey} value={sessionKey}>{sessionKey}</option>
              ))}
            </select>
          </div>

          {scheduleMode ? (
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-[0.24em] text-[#9c907f]">Scheduled At</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="pixel-inset w-full rounded-[10px] bg-[#09070b] px-3 py-2 text-sm text-white outline-none focus:border-[#d1a45a]/50" />
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#d1a45a]/15 px-6 py-4">
          <button type="button" onClick={() => handleCreate('running')} disabled={!canSubmitBase || scheduleMode} className="pixel-button rounded-[10px] bg-[#d1a45a]/15 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[#f2dfba] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            Run Now
          </button>
          <button type="button" onClick={() => setScheduleMode(true)} disabled={!canSubmitBase} className={`pixel-button rounded-[10px] px-4 py-2 text-[10px] uppercase tracking-[0.18em] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${scheduleMode ? 'bg-violet-500/20 text-violet-100' : 'bg-violet-500/10 text-violet-200/60'}`}>
            Schedule
          </button>
          {scheduleMode ? (
            <button type="button" onClick={() => handleCreate('scheduled')} disabled={!canSubmitBase || !scheduledAt} className="pixel-button rounded-[10px] bg-violet-500/20 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-violet-100 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
              Confirm Schedule
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
