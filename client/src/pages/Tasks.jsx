import TaskList from '@/components/TaskList';
import PriorityPanel from '@/components/PriorityPanel';
import PomodoroTimer from '@/components/PomodoroTimer';

export default function Tasks() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tasks</h1>
      <PomodoroTimer />
      <PriorityPanel />
      <TaskList />
    </div>
  );
}
