import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Square, RotateCcw, Timer } from 'lucide-react';
import { taskService } from '@/services/taskService';
import { focusService } from '@/services/focusService';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatClock, formatDuration } from '@/lib/utils';

const PRESETS = [25, 15, 5];

export default function PomodoroTimer() {
  const [tasks, setTasks] = useState([]);
  const [taskId, setTaskId] = useState('');
  const [minutes, setMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);
  // Mirrors sessionId so the interval's auto-stop reads the current id, not the
  // stale value captured when the interval was created.
  const sessionIdRef = useRef(null);

  const clearTick = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const loadToday = useCallback(async () => {
    try {
      const { total } = await focusService.stats();
      setTodaySeconds(total);
    } catch {
      // Non-fatal: the timer still works without the running total.
    }
  }, []);

  useEffect(() => {
    taskService
      .list({ status: 'PENDING' })
      .then(setTasks)
      .catch(() => {});
    loadToday();
    return clearTick;
  }, [loadToday]);

  const stop = useCallback(async () => {
    clearTick();
    setRunning(false);
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    setSecondsLeft(minutes * 60);
    if (id) {
      try {
        await focusService.stop(id);
        await loadToday();
      } catch (err) {
        setError(apiError(err, 'Failed to save focus session'));
      }
    }
  }, [minutes, loadToday]);

  const start = async () => {
    setError('');
    try {
      const session = await focusService.start(taskId || null, new Date().toISOString());
      sessionIdRef.current = session.id;
      setRunning(true);
      setSecondsLeft(minutes * 60);
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            // Time's up — close the session (stop reads latest sessionId from state).
            stop();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (err) {
      setError(apiError(err, 'Failed to start focus session'));
    }
  };

  const reset = () => {
    if (running) {
      stop();
    } else {
      setSecondsLeft(minutes * 60);
    }
  };

  const pickMinutes = (m) => {
    setMinutes(m);
    if (!running) setSecondsLeft(m * 60);
  };

  return (
    <div className="task-card flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Timer className="h-4 w-4" />
        <span className="font-medium">Focus Timer</span>
        <span className="ml-auto text-xs text-muted-foreground">
          Today: {formatDuration(todaySeconds)}
        </span>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
        <div className="font-mono text-4xl tabular-nums" aria-label="Time remaining">
          {formatClock(secondsLeft)}
        </div>

        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            disabled={running}
            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Focus task"
          >
            <option value="">No task (general focus)</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>

          <div className="flex gap-1">
            {PRESETS.map((m) => (
              <Button
                key={m}
                size="sm"
                variant={minutes === m ? 'default' : 'outline'}
                onClick={() => pickMinutes(m)}
                disabled={running}
              >
                {m}m
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {running ? (
          <Button onClick={stop} variant="secondary">
            <Square className="h-4 w-4" /> Stop
          </Button>
        ) : (
          <Button onClick={start}>
            <Play className="h-4 w-4" /> Start
          </Button>
        )}
        <Button onClick={reset} variant="ghost">
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
