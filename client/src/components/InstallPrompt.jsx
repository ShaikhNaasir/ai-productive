import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Surfaces an "Install app" button once the browser fires beforeinstallprompt.
// The event is deferred so the user installs on demand; the button disappears
// after a choice is made or the app is installed.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferred) return null;

  const install = async () => {
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      // Ignore — the user dismissed the prompt.
    }
    setDeferred(null);
  };

  return (
    <Button variant="outline" size="sm" onClick={install} aria-label="Install app">
      <Download className="h-4 w-4" /> Install app
    </Button>
  );
}
