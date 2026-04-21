import { useState } from 'react';
import type { ProjectFile } from '../code-runner/CodeRunner';
import { LandingPage } from './LandingPage';
import { SimulatorView } from './SimulatorView';
import { CodeViewer } from './CodeViewer';
import { ControlsMappingModal } from './ControlsMappingModal';
import { defaultKeymap, type Keymap } from '../input/Keymap';

type View = 'landing' | 'mapping' | 'simulator' | 'code';

export function App() {
  const [view, setView] = useState<View>('landing');
  const [loadedFiles, setLoadedFiles] = useState<ProjectFile[]>([]);
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [keymap, setKeymap] = useState<Keymap>(defaultKeymap());

  if (view === 'landing') {
    return (
      <LandingPage
        loadedFiles={loadedFiles}
        setLoadedFiles={setLoadedFiles}
        useCustomModel={useCustomModel}
        setUseCustomModel={setUseCustomModel}
        onLaunch={() => setView('mapping')}
        onViewCode={() => setView('code')}
      />
    );
  }

  if (view === 'code') {
    return <CodeViewer files={loadedFiles} onBack={() => setView('landing')} />;
  }

  if (view === 'mapping') {
    return (
      <ControlsMappingModal
        files={loadedFiles}
        onStart={(km) => { setKeymap(km); setView('simulator'); }}
        onCancel={() => setView('landing')}
      />
    );
  }

  return (
    <SimulatorView
      loadedFiles={loadedFiles}
      useCustomModel={useCustomModel}
      keymap={keymap}
    />
  );
}
