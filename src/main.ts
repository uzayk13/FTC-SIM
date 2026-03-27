import './style.css';
import { Engine } from './core/Engine';
import type { ProjectFile } from './code-runner/CodeRunner';

const landing = document.getElementById('landing')!;
const app = document.getElementById('app')!;
let loadedFiles: ProjectFile[] = [];

function launchSimulator() {
  landing.classList.add('hidden');
  app.classList.remove('hidden');

  const useCustomModel = (document.getElementById('use-custom-model') as HTMLInputElement).checked;

  const canvas = document.getElementById('simulator-canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const engine = new Engine(canvas, useCustomModel);
  engine.start();

  if (loadedFiles.length > 0) {
    engine.codeRunner.loadProject(loadedFiles);
    engine.ui.showCodeStatus();
  }

  (window as any).__engine = engine;
}

// ── Elements ──
const fileBtnLanding = document.getElementById('landing-file-btn')!;
const fileInputLanding = document.getElementById('landing-file-input') as HTMLInputElement;
const folderBtnLanding = document.getElementById('landing-folder-btn')!;
const folderInputLanding = document.getElementById('landing-folder-input') as HTMLInputElement;
const fileStatus = document.getElementById('file-selected')!;
const launchBtn = document.getElementById('landing-launch') as HTMLButtonElement;
const fileCard = document.getElementById('upload-card-file')!;
const githubCard = document.getElementById('upload-card-github')!;
const githubBtn = document.getElementById('landing-github-btn')!;
const githubInput = document.getElementById('github-url-input') as HTMLInputElement;
const githubStatus = document.getElementById('github-status')!;

// ── File Upload (multiple files) ──
fileBtnLanding.addEventListener('click', () => fileInputLanding.click());

fileInputLanding.addEventListener('change', async () => {
  const files = fileInputLanding.files;
  if (!files || files.length === 0) return;

  loadedFiles = [];
  for (const file of Array.from(files)) {
    const content = await readFileAsText(file);
    loadedFiles.push({ path: file.name, content });
  }

  const names = loadedFiles.map(f => f.path.split('/').pop()).join(', ');
  fileStatus.textContent = `Loaded ${loadedFiles.length} file(s): ${names}`;
  fileStatus.classList.remove('hidden', 'error');
  fileCard.classList.add('active');
  githubCard.classList.remove('active');
  launchBtn.disabled = false;
  githubStatus.classList.add('hidden');
});

// ── Folder Upload ──
folderBtnLanding.addEventListener('click', () => folderInputLanding.click());

folderInputLanding.addEventListener('change', async () => {
  const files = folderInputLanding.files;
  if (!files || files.length === 0) return;

  loadedFiles = [];
  const validExtensions = ['.java', '.js', '.ts', '.gradle', '.gradle.kts'];
  let skipped = 0;

  for (const file of Array.from(files)) {
    const path = (file as any).webkitRelativePath || file.name;

    // Skip non-source files, build outputs, and hidden dirs
    if (path.includes('/build/') || path.includes('/.') || path.includes('/gradle/wrapper/')) {
      skipped++;
      continue;
    }

    if (validExtensions.some(e => file.name.toLowerCase().endsWith(e))) {
      const content = await readFileAsText(file);
      loadedFiles.push({ path, content });
    } else {
      skipped++;
    }
  }

  if (loadedFiles.length === 0) {
    fileStatus.textContent = 'No source files found in folder. Expected .java, .js, .ts, or .gradle files.';
    fileStatus.classList.remove('hidden');
    fileStatus.classList.add('error');
    return;
  }

  const javaCount = loadedFiles.filter(f => f.path.endsWith('.java')).length;
  const gradleCount = loadedFiles.filter(f => f.path.includes('.gradle')).length;
  const jsCount = loadedFiles.filter(f => f.path.endsWith('.js') || f.path.endsWith('.ts')).length;

  let summary = `Loaded ${loadedFiles.length} file(s)`;
  const parts = [];
  if (javaCount > 0) parts.push(`${javaCount} Java`);
  if (gradleCount > 0) parts.push(`${gradleCount} Gradle`);
  if (jsCount > 0) parts.push(`${jsCount} JS/TS`);
  if (parts.length > 0) summary += ` (${parts.join(', ')})`;
  if (skipped > 0) summary += `, ${skipped} skipped`;

  fileStatus.textContent = summary;
  fileStatus.classList.remove('hidden', 'error');
  fileCard.classList.add('active');
  githubCard.classList.remove('active');
  launchBtn.disabled = false;
  githubStatus.classList.add('hidden');
});

// ── GitHub Import ──
function parseGitHubUrl(url: string): {
  type: 'file' | 'directory';
  owner: string;
  repo: string;
  branch: string;
  path: string;
} | null {
  // File URL: github.com/user/repo/blob/branch/path/to/file.java
  const blobMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/
  );
  if (blobMatch) {
    return { type: 'file', owner: blobMatch[1], repo: blobMatch[2], branch: blobMatch[3], path: blobMatch[4] };
  }

  // Directory URL: github.com/user/repo/tree/branch/path/to/dir
  const treeMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.+))?$/
  );
  if (treeMatch) {
    return { type: 'directory', owner: treeMatch[1], repo: treeMatch[2], branch: treeMatch[3], path: treeMatch[4] ?? '' };
  }

  // Repo root: github.com/user/repo
  const repoMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/
  );
  if (repoMatch) {
    return { type: 'directory', owner: repoMatch[1], repo: repoMatch[2], branch: 'main', path: '' };
  }

  // Raw URL
  if (url.includes('raw.githubusercontent.com')) {
    return null; // Will be handled as a direct fetch
  }

  return null;
}

async function fetchGitHubDirectory(owner: string, repo: string, branch: string, dirPath: string): Promise<ProjectFile[]> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`GitHub API: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const tree: Array<{ path: string; type: string; url: string }> = data.tree ?? [];

  // Filter to source files within the target directory
  const validExtensions = ['.java', '.js', '.ts', '.gradle'];
  const sourcePaths = tree.filter(item => {
    if (item.type !== 'blob') return false;
    if (dirPath && !item.path.startsWith(dirPath)) return false;
    // Skip build outputs and hidden dirs
    if (item.path.includes('/build/') || item.path.includes('/.')) return false;
    return validExtensions.some(ext => item.path.endsWith(ext));
  });

  if (sourcePaths.length === 0) {
    throw new Error(`No source files found in ${dirPath || 'repository'}`);
  }

  // Fetch file contents (limit to 50 files to avoid rate limiting)
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

githubBtn.addEventListener('click', async () => {
  const url = githubInput.value.trim();
  if (!url) {
    githubStatus.textContent = 'Please enter a URL';
    githubStatus.classList.remove('hidden');
    githubStatus.classList.add('error');
    return;
  }

  githubStatus.textContent = 'Fetching...';
  githubStatus.classList.remove('hidden', 'error');

  try {
    const parsed = parseGitHubUrl(url);

    if (parsed?.type === 'directory') {
      // Fetch entire directory
      githubStatus.textContent = `Fetching files from ${parsed.owner}/${parsed.repo}/${parsed.path || '(root)'}...`;
      const files = await fetchGitHubDirectory(parsed.owner, parsed.repo, parsed.branch, parsed.path);
      loadedFiles = files;

      const javaCount = files.filter(f => f.path.endsWith('.java')).length;
      const gradleCount = files.filter(f => f.path.includes('.gradle')).length;
      const parts = [];
      if (javaCount > 0) parts.push(`${javaCount} Java`);
      if (gradleCount > 0) parts.push(`${gradleCount} Gradle`);

      githubStatus.textContent = `Loaded ${files.length} file(s)${parts.length ? ' (' + parts.join(', ') + ')' : ''}`;
      githubStatus.classList.remove('error');
      githubCard.classList.add('active');
      fileCard.classList.remove('active');
      launchBtn.disabled = false;
      fileStatus.classList.add('hidden');

    } else {
      // Single file fetch
      let rawUrl: string;
      if (parsed?.type === 'file') {
        rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.branch}/${parsed.path}`;
      } else {
        rawUrl = url; // Direct raw URL
      }

      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const code = await res.text();

      if (code.includes('<!DOCTYPE') || code.includes('<html')) {
        throw new Error('Got an HTML page instead of code. Use a raw file URL or a /blob/ link.');
      }

      const filename = rawUrl.split('/').pop() || 'file';
      loadedFiles = [{ path: filename, content: code }];

      githubStatus.textContent = `Loaded: ${filename}`;
      githubStatus.classList.remove('error');
      githubCard.classList.add('active');
      fileCard.classList.remove('active');
      launchBtn.disabled = false;
      fileStatus.classList.add('hidden');
    }
  } catch (err: any) {
    githubStatus.textContent = `Error: ${err.message}`;
    githubStatus.classList.add('error');
  }
});

githubInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') githubBtn.click();
});

// ── Launch ──
launchBtn.addEventListener('click', () => launchSimulator());

// ── Util ──
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}
