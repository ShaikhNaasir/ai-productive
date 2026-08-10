import TaskList from '@/components/TaskList';
import PriorityPanel from '@/components/PriorityPanel';

export default function Tasks() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tasks</h1>
      <PriorityPanel />
      <TaskList />
    </div>
  );
}
