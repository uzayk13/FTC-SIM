import { useState } from 'react';
import type { ProjectFile } from '../code-runner/CodeRunner';
import { LandingPage } from './LandingPage';
import { SimulatorView } from './SimulatorView';
import { CodeViewer } from './CodeViewer';
import { ControlsMappingModal } from './ControlsMappingModal';
import { ModelViewer } from './ModelViewer';
import { defaultKeymap, type Keymap } from '../input/Keymap';
import type { UploadedRobotModel } from '../robot/RobotModel';

type View = 'landing' | 'mapping' | 'simulator' | 'code' | 'modelviewer';

export function App() {
  const [view, setView] = useState<View>('landing');
  const [loadedFiles, setLoadedFiles] = useState<ProjectFile[]>([]);
  const [robotModel, setRobotModel] = useState<UploadedRobotModel | null>(null);
  const [keymap, setKeymap] = useState<Keymap>(defaultKeymap());

  if (view === 'landing') {
    return (
      <LandingPage
        loadedFiles={loadedFiles}
        setLoadedFiles={setLoadedFiles}
        robotModel={robotModel}
        setRobotModel={setRobotModel}
        onLaunch={() => setView('mapping')}
        onViewCode={() => setView('code')}
        onViewModel={() => setView('modelviewer')}
      />
    );
  }

  if (view === 'code') {
    return <CodeViewer files={loadedFiles} onBack={() => setView('landing')} />;
  }

  if (view === 'modelviewer' && robotModel) {
    return (
      <ModelViewer
        model={robotModel}
        onUpdate={setRobotModel}
        onBack={() => setView('landing')}
      />
    );
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
      robotModel={robotModel}
      keymap={keymap}
    />
  );
}
