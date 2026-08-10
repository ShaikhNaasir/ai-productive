import ChatAssistant from '@/components/ChatAssistant';

export default function Assistant() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">AI Assistant</h1>
      <ChatAssistant />
    </div>
  );
}
