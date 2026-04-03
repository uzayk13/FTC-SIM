import { useState } from 'react';
import type { ProjectFile } from '../code-runner/CodeRunner';
import { LandingPage } from './LandingPage';
import { SimulatorView } from './SimulatorView';

export function App() {
  const [launched, setLaunched] = useState(false);
  const [loadedFiles, setLoadedFiles] = useState<ProjectFile[]>([]);
  const [useCustomModel, setUseCustomModel] = useState(false);

  const handleLaunch = () => {
    setLaunched(true);
  };

  if (!launched) {
    return (
      <LandingPage
        loadedFiles={loadedFiles}
        setLoadedFiles={setLoadedFiles}
        useCustomModel={useCustomModel}
        setUseCustomModel={setUseCustomModel}
        onLaunch={handleLaunch}
      />
    );
  }

  return (
    <SimulatorView
      loadedFiles={loadedFiles}
      useCustomModel={useCustomModel}
    />
  );
}
