import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AccessProvider } from '@/lib/contexts/AccessContext';
import type { UserAppAccess } from '@/lib/rbac/types';
import { BarcodeSessionProvider } from '@/app/log-viewer/barcode-generator/_components/BarcodeSessionProvider';
import BarcodeGeneratorPage from '@/app/log-viewer/barcode-generator/page';
import { AppShell } from '@/components/organisms/AppShell';
import { changeTestSession } from './barcode-auth';

function Harness() {
    const [user, setUser] = useState('browser-user');
    const [visible, setVisible] = useState(true);
    const denied = new URLSearchParams(location.search).has('denied');
    const access: UserAppAccess = { userId: user, allowedModules: denied ? [] : ['log_viewer'], role: 'member',
        canManageAccess: false, overrides: {}, modules: denied ? [] : [{ slug: 'log_viewer', label: 'Log Viewer', path: '/log-viewer',
            icon: 'FileSearch', sortOrder: 1, description: null, enabled: true, isAlwaysAllowed: false, isManaged: true }] };
    return <AccessProvider access={access}><BarcodeSessionProvider>
        <div className="flex flex-wrap gap-3 p-3" aria-label="Test controls">
            <button onClick={() => setVisible(!visible)}>Toggle test route</button>
            <button onClick={() => changeTestSession(null)}>Test sign out</button>
            <button onClick={() => { changeTestSession('another-user'); setUser('another-user'); }}>Test account switch</button>
        </div>
        <AppShell persistent>{visible && <BarcodeGeneratorPage />}</AppShell>
    </BarcodeSessionProvider></AccessProvider>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
