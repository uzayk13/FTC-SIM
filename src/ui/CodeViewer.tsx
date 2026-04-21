import { useEffect, useMemo, useRef, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-groovy';
import 'prismjs/components/prism-properties';
import 'prismjs/components/prism-markdown';
import 'prismjs/themes/prism-tomorrow.css';
import type { ProjectFile } from '../code-runner/CodeRunner';

interface Props {
  files: ProjectFile[];
  onBack: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  content?: string;
}

function buildTree(files: ProjectFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isFolder: true, children: [] };
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sorted) {
    const parts = file.path.split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');
      let child = node.children.find((c) => c.name === name);
      if (!child) {
        child = {
          name,
          path,
          isFolder: !isLast,
          children: [],
          content: isLast ? file.content : undefined,
        };
        node.children.push(child);
      }
      node = child;
    }
  }

  const sortNode = (n: TreeNode) => {
    n.children.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortNode);
  };
  sortNode(root);

  return root;
}

function collectTopLevelFolders(root: TreeNode): string[] {
  return root.children.filter((c) => c.isFolder).map((c) => c.path);
}

function languageForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'java': return 'java';
    case 'kt': case 'kts': return 'kotlin';
    case 'js': case 'jsx': case 'mjs': case 'cjs': return 'javascript';
    case 'ts': case 'tsx': return 'typescript';
    case 'json': return 'json';
    case 'xml': case 'html': case 'svg': return 'markup';
    case 'gradle': case 'groovy': return 'groovy';
    case 'properties': return 'properties';
    case 'md': case 'markdown': return 'markdown';
    default: return 'plain';
  }
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}

function TreeItem({ node, depth, selectedPath, expanded, onToggle, onSelect }: TreeItemProps) {
  const isOpen = expanded.has(node.path);
  const isSelected = !node.isFolder && selectedPath === node.path;

  const handleClick = () => {
    if (node.isFolder) onToggle(node.path);
    else onSelect(node.path);
  };

  return (
    <>
      <div
        className={`tree-row ${node.isFolder ? 'folder' : 'file'} ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={handleClick}
      >
        <span className="tree-caret">
          {node.isFolder ? (isOpen ? '▾' : '▸') : ''}
        </span>
        <span className="tree-name">{node.name}</span>
      </div>
      {node.isFolder && isOpen &&
        node.children.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            expanded={expanded}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

export function CodeViewer({ files, onBack }: Props) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(collectTopLevelFolders(tree))
  );
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const bodyRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const fileMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of files) m.set(f.path, f.content);
    return m;
  }, [files]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectedContent = selectedPath ? fileMap.get(selectedPath) ?? '' : '';
  const language = selectedPath ? languageForPath(selectedPath) : 'plain';

  const highlighted = useMemo(() => {
    if (!selectedPath) return '';
    const grammar = Prism.languages[language];
    if (!grammar) return escapeHtml(selectedContent);
    return Prism.highlight(selectedContent, grammar, language);
  }, [selectedContent, language, selectedPath]);

  const lineCount = selectedContent.length === 0 ? 0 : selectedContent.split('\n').length;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !bodyRef.current) return;
      const rect = bodyRef.current.getBoundingClientRect();
      const next = Math.min(Math.max(e.clientX - rect.left, 160), rect.width - 240);
      setSidebarWidth(next);
    };
    const onUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div className="code-viewer">
      <div className="code-viewer-topbar">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2>Project Files</h2>
        <span className="code-viewer-meta">
          {files.length} file{files.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="code-viewer-body" ref={bodyRef}>
        <div className="code-viewer-tree" style={{ width: sidebarWidth }}>
          {tree.children.length === 0 ? (
            <div className="code-viewer-empty">No files loaded</div>
          ) : (
            tree.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={0}
                selectedPath={selectedPath}
                expanded={expanded}
                onToggle={toggle}
                onSelect={setSelectedPath}
              />
            ))
          )}
        </div>
        <div className="code-viewer-divider" onMouseDown={startDrag} />
        <div className="code-viewer-main">
          {selectedPath ? (
            <>
              <div className="code-viewer-filename">
                {selectedPath}
                <span className="code-viewer-lang">{language}</span>
              </div>
              <div className="code-pane">
                <div className="line-gutter">
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <pre className={`code-content language-${language}`}>
                  <code
                    className={`language-${language}`}
                    dangerouslySetInnerHTML={{ __html: highlighted }}
                  />
                </pre>
              </div>
            </>
          ) : (
            <div className="code-viewer-placeholder">
              Select a file from the tree to view its contents.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
