import { useRef, useState } from 'react';
import type { ProjectFile } from '../code-runner/CodeRunner';
import type { UploadedRobotModel } from '../robot/RobotModel';
import { parseGLBFile } from '../robot/RobotModel';

interface Props {
  loadedFiles: ProjectFile[];
  setLoadedFiles: (files: ProjectFile[]) => void;
  robotModel: UploadedRobotModel | null;
  setRobotModel: (m: UploadedRobotModel | null) => void;
  onLaunch: () => void;
  onViewCode: () => void;
  onViewModel: () => void;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

function parseGitHubUrl(url: string): {
  type: 'file' | 'directory';
  owner: string;
  repo: string;
  branch: string;
  path: string;
} | null {
  const blobMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/
  );
  if (blobMatch) {
    return { type: 'file', owner: blobMatch[1], repo: blobMatch[2], branch: blobMatch[3], path: blobMatch[4] };
  }

  const treeMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.+))?$/
  );
  if (treeMatch) {
    return { type: 'directory', owner: treeMatch[1], repo: treeMatch[2], branch: treeMatch[3], path: treeMatch[4] ?? '' };
  }

  const repoMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/
  );
  if (repoMatch) {
    return { type: 'directory', owner: repoMatch[1], repo: repoMatch[2], branch: 'main', path: '' };
  }

  if (url.includes('raw.githubusercontent.com')) {
    return null;
  }

  return null;
}

async function fetchGitHubDirectory(owner: string, repo: string, branch: string, dirPath: string): Promise<ProjectFile[]> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`GitHub API: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const tree: Array<{ path: string; type: string; url: string }> = data.tree ?? [];

  const validExtensions = ['.java', '.js', '.ts', '.gradle'];
  const sourcePaths = tree.filter(item => {
    if (item.type !== 'blob') return false;
    if (dirPath && !item.path.startsWith(dirPath)) return false;
    if (item.path.includes('/build/') || item.path.includes('/.')) return false;
    return validExtensions.some(ext => item.path.endsWith(ext));
  });

  if (sourcePaths.length === 0) {
    throw new Error(`No source files found in ${dirPath || 'repository'}`);
  }

  const filesToFetch = sourcePaths.slice(0, 50);
  const files: ProjectFile[] = [];

  for (const item of filesToFetch) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;
    const fileRes = await fetch(rawUrl);
    if (fileRes.ok) {
      const content = await fileRes.text();
      files.push({ path: item.path, content });
    }
  }

  return files;
}

export function LandingPage({ loadedFiles, setLoadedFiles, robotModel, setRobotModel, onLaunch, onViewCode, onViewModel }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  const [fileStatus, setFileStatus] = useState('');
  const [fileError, setFileError] = useState(false);
  const [githubUrl, setGithubUrl] = useState('');
  const [githubStatus, setGithubStatus] = useState('');
  const [githubError, setGithubError] = useState(false);
  const [activeCard, setActiveCard] = useState<'file' | 'github' | null>(null);
  const [modelStatus, setModelStatus] = useState(robotModel ? `Loaded: ${robotModel.name}` : '');
  const [modelError, setModelError] = useState(false);

  const handleModelUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!/\.(glb|gltf)$/i.test(file.name)) {
      setModelStatus('Expected a .glb or .gltf file.');
      setModelError(true);
      return;
    }
    try {
      setModelStatus(`Parsing ${file.name}…`);
      setModelError(false);
      const model = await parseGLBFile(file);
      setRobotModel(model);
      setModelStatus(`Loaded: ${file.name}`);
    } catch (err: any) {
      setModelStatus(`Error: ${err.message ?? String(err)}`);
      setModelError(true);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const loaded: ProjectFile[] = [];
    for (const file of Array.from(files)) {
      const content = await readFileAsText(file);
      loaded.push({ path: file.name, content });
    }

    setLoadedFiles(loaded);
    const names = loaded.map(f => f.path.split('/').pop()).join(', ');
    setFileStatus(`Loaded ${loaded.length} file(s): ${names}`);
    setFileError(false);
    setActiveCard('file');
    setGithubStatus('');
  };

  const handleFolderUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const loaded: ProjectFile[] = [];
    const validExtensions = ['.java', '.js', '.ts', '.gradle', '.gradle.kts'];
    let skipped = 0;

    for (const file of Array.from(files)) {
      const path = (file as any).webkitRelativePath || file.name;

      if (path.includes('/build/') || path.includes('/.') || path.includes('/gradle/wrapper/')) {
        skipped++;
        continue;
      }

      if (validExtensions.some(e => file.name.toLowerCase().endsWith(e))) {
        const content = await readFileAsText(file);
        loaded.push({ path, content });
      } else {
        skipped++;
      }
    }

    if (loaded.length === 0) {
      setFileStatus('No source files found in folder. Expected .java, .js, .ts, or .gradle files.');
      setFileError(true);
      return;
    }

    setLoadedFiles(loaded);

    const javaCount = loaded.filter(f => f.path.endsWith('.java')).length;
    const gradleCount = loaded.filter(f => f.path.includes('.gradle')).length;
    const jsCount = loaded.filter(f => f.path.endsWith('.js') || f.path.endsWith('.ts')).length;

    let summary = `Loaded ${loaded.length} file(s)`;
    const parts = [];
    if (javaCount > 0) parts.push(`${javaCount} Java`);
    if (gradleCount > 0) parts.push(`${gradleCount} Gradle`);
    if (jsCount > 0) parts.push(`${jsCount} JS/TS`);
    if (parts.length > 0) summary += ` (${parts.join(', ')})`;
    if (skipped > 0) summary += `, ${skipped} skipped`;

    setFileStatus(summary);
    setFileError(false);
    setActiveCard('file');
    setGithubStatus('');
  };

  const handleGithubFetch = async () => {
    const url = githubUrl.trim();
    if (!url) {
      setGithubStatus('Please enter a URL');
      setGithubError(true);
      return;
    }

    setGithubStatus('Fetching...');
    setGithubError(false);

    try {
      const parsed = parseGitHubUrl(url);

      if (parsed?.type === 'directory') {
        setGithubStatus(`Fetching files from ${parsed.owner}/${parsed.repo}/${parsed.path || '(root)'}...`);
        const files = await fetchGitHubDirectory(parsed.owner, parsed.repo, parsed.branch, parsed.path);
        setLoadedFiles(files);

        const javaCount = files.filter(f => f.path.endsWith('.java')).length;
        const gradleCount = files.filter(f => f.path.includes('.gradle')).length;
        const parts = [];
        if (javaCount > 0) parts.push(`${javaCount} Java`);
        if (gradleCount > 0) parts.push(`${gradleCount} Gradle`);

        setGithubStatus(`Loaded ${files.length} file(s)${parts.length ? ' (' + parts.join(', ') + ')' : ''}`);
        setGithubError(false);
        setActiveCard('github');
        setFileStatus('');
      } else {
        let rawUrl: string;
        if (parsed?.type === 'file') {
          rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.branch}/${parsed.path}`;
        } else {
          rawUrl = url;
        }

        const res = await fetch(rawUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const code = await res.text();

        if (code.includes('<!DOCTYPE') || code.includes('<html')) {
          throw new Error('Got an HTML page instead of code. Use a raw file URL or a /blob/ link.');
        }

        const filename = rawUrl.split('/').pop() || 'file';
        setLoadedFiles([{ path: filename, content: code }]);

        setGithubStatus(`Loaded: ${filename}`);
        setGithubError(false);
        setActiveCard('github');
        setFileStatus('');
      }
    } catch (err: any) {
      setGithubStatus(`Error: ${err.message}`);
      setGithubError(true);
    }
  };

  const canLaunch = loadedFiles.length > 0;

  return (
    <div id="landing">
      <div className="landing-container">
        <div className="landing-header">
          <h1>FTC Simulator</h1>
          <p className="landing-subtitle">DECODE 2025-26</p>
        </div>

        <div className="upload-section">
          <h2>Load Your OpMode</h2>
          <p className="upload-desc">Upload your FTC Robot Controller code. Supports Java (FTC SDK + FTCLib), Gradle projects, JS, and TS.</p>

          <div className="upload-options">
            {/* File Upload */}
            <div className={`upload-card${activeCard === 'file' ? ' active' : ''}`}>
              <div className="upload-icon">&#128193;</div>
              <h3>Upload Files</h3>
              <p>Select a single file or multiple Java/JS/TS files</p>
              <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>Choose File(s)</button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".js,.ts,.java,.gradle"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              <div className="upload-divider">or</div>
              <button className="upload-btn upload-btn-secondary" onClick={() => folderInputRef.current?.click()}>Upload Project Folder</button>
              <input
                ref={folderInputRef}
                type="file"
                {...{ webkitdirectory: '', directory: '' } as any}
                style={{ display: 'none' }}
                onChange={(e) => handleFolderUpload(e.target.files)}
              />
              {fileStatus && (
                <div className={`file-selected${fileError ? ' error' : ''}`}>{fileStatus}</div>
              )}
            </div>

            {/* GitHub Import */}
            <div className={`upload-card${activeCard === 'github' ? ' active' : ''}`}>
              <div className="upload-icon">&#128279;</div>
              <h3>Import from GitHub</h3>
              <p>Paste a file URL or TeamCode folder link from GitHub</p>
              <input
                type="text"
                className="github-input"
                placeholder="https://github.com/user/repo/tree/main/TeamCode/src"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGithubFetch(); }}
              />
              <button className="upload-btn" onClick={handleGithubFetch}>Fetch Code</button>
              {githubStatus && (
                <div className={`file-selected${githubError ? ' error' : ''}`}>{githubStatus}</div>
              )}
            </div>
          </div>

          <div className="upload-options" style={{ marginTop: 20 }}>
            <div className={`upload-card${robotModel ? ' active' : ''}`}>
              <div className="upload-icon">&#129302;</div>
              <h3>Robot CAD Model (optional)</h3>
              <p>Upload a .glb / .gltf file of your robot. Auto-fit to chassis, multi-hull physics.</p>
              <button className="upload-btn" onClick={() => modelInputRef.current?.click()}>
                {robotModel ? 'Replace Model' : 'Choose .glb / .gltf'}
              </button>
              <input
                ref={modelInputRef}
                type="file"
                accept=".glb,.gltf"
                style={{ display: 'none' }}
                onChange={(e) => handleModelUpload(e.target.files)}
              />
              {robotModel && (
                <button
                  className="upload-btn upload-btn-secondary"
                  style={{ marginTop: 8 }}
                  onClick={onViewModel}
                >
                  View / Adjust Model
                </button>
              )}
              {robotModel && (
                <button
                  className="upload-btn upload-btn-secondary"
                  style={{ marginTop: 8, background: '#3a1a1a' }}
                  onClick={() => { setRobotModel(null); setModelStatus(''); }}
                >
                  Remove
                </button>
              )}
              {modelStatus && (
                <div className={`file-selected${modelError ? ' error' : ''}`}>{modelStatus}</div>
              )}
            </div>
          </div>

          <div className="landing-actions">
            <button className="launch-btn" disabled={!canLaunch} onClick={onLaunch}>
              Launch Simulator
            </button>
            <button className="view-code-btn" disabled={!canLaunch} onClick={onViewCode}>
              View Code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
