import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Square, RotateCcw, Timer } from 'lucide-react';
import { taskService } from '@/services/taskService';
import { focusService } from '@/services/focusService';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatClock, formatDuration } from '@/lib/utils';

const PRESETS = [25, 15, 5];
const clampMinutes = (m) => Math.min(180, Math.max(1, Math.round(m) || 1));

export default function PomodoroTimer() {
  const [tasks, setTasks] = useState([]);
  const [taskId, setTaskId] = useState('');
  const [minutes, setMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);
  // Refs so the interval + stop always read live values, not stale closures.
  const sessionIdRef = useRef(null);
  const plannedRef = useRef(25 * 60);
  const elapsedRef = useRef(0); // active seconds, excludes paused time

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

  const stop = useCallback(async () => {
    clearTick();
    setRunning(false);
    setPaused(false);
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    const consumed = elapsedRef.current;
    setSecondsLeft(plannedRef.current);
    if (id) {
      try {
        await focusService.stop(id, consumed);
        await loadToday();
      } catch (err) {
        setError(apiError(err, 'Failed to save focus session'));
      }
    }
  }, [loadToday]);

  // Tick once per second while running (and not paused): advance active elapsed,
  // update the countdown, and auto-stop when the planned time is reached.
  const beginInterval = useCallback(() => {
    clearTick();
    intervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      const left = plannedRef.current - elapsedRef.current;
      setSecondsLeft(left > 0 ? left : 0);
      if (left <= 0) stop();
    }, 1000);
  }, [stop]);

  useEffect(() => {
    taskService
      .list({ status: 'PENDING' })
      .then(setTasks)
      .catch(() => {});
    loadToday();

    // Recover a session left open by a reload or navigating away and back.
    focusService
      .active()
      .then((session) => {
        if (!session) return;
        const planned = session.plannedSeconds || minutes * 60;
        const elapsed = Math.max(0, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000));
        sessionIdRef.current = session.id;
        plannedRef.current = planned;
        elapsedRef.current = Math.min(elapsed, planned);
        setTaskId(session.taskId || '');
        if (session.plannedSeconds) setMinutes(clampMinutes(session.plannedSeconds / 60));
        const left = planned - elapsedRef.current;
        if (left <= 0) {
          setSecondsLeft(0);
          stop(); // past planned time — close it out (server caps at plannedSeconds)
        } else {
          setSecondsLeft(left);
          setRunning(true);
          beginInterval();
        }
      })
      .catch(() => {});

    return clearTick;
    // Runs once on mount; helpers are stable for our purposes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadToday]);

  const start = async () => {
    setError('');
    const planned = minutes * 60;
    try {
      const session = await focusService.start(taskId || null, new Date().toISOString(), planned);
      sessionIdRef.current = session.id;
      plannedRef.current = session.plannedSeconds || planned;
      elapsedRef.current = 0;
      setSecondsLeft(plannedRef.current);
      setRunning(true);
      setPaused(false);
      beginInterval();
    } catch (err) {
      setError(apiError(err, 'Failed to start focus session'));
    }
  };

  const pause = () => {
    clearTick();
    setPaused(true);
  };

  const resume = () => {
    setPaused(false);
    beginInterval();
  };

  const reset = () => {
    if (running) {
      stop();
    } else {
      setSecondsLeft(minutes * 60);
    }
  };

  const pickMinutes = (m) => {
    const clamped = clampMinutes(m);
    setMinutes(clamped);
    if (!running) {
      plannedRef.current = clamped * 60;
      setSecondsLeft(clamped * 60);
    }
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

          <div className="flex items-center gap-1">
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
            <input
              type="number"
              min={1}
              max={180}
              value={minutes}
              onChange={(e) => pickMinutes(Number(e.target.value))}
              disabled={running}
              aria-label="Custom minutes"
              className="h-9 w-16 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
            />
            <span className="text-xs text-muted-foreground">min</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!running && (
          <Button onClick={start}>
            <Play className="h-4 w-4" /> Start
          </Button>
        )}
        {running && !paused && (
          <Button onClick={pause} variant="secondary">
            <Pause className="h-4 w-4" /> Pause
          </Button>
        )}
        {running && paused && (
          <Button onClick={resume}>
            <Play className="h-4 w-4" /> Resume
          </Button>
        )}
        {running && (
          <Button onClick={stop} variant="secondary">
            <Square className="h-4 w-4" /> Stop
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
