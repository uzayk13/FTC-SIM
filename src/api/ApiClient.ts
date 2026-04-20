export interface CompileRequest {
  files: Array<{ path: string; content: string }>;
  mode: 'validate' | 'transpile';
}

export interface CompileError {
  file: string | null;
  line: number;
  column: number;
  message: string;
  severity: string;
}

export interface CompileResponse {
  success: boolean;
  transpiledCode: string | null;
  className: string | null;
  opModeType: string | null;
  annotations: Record<string, string>;
  errors: CompileError[];
  warnings: CompileError[];
}

/**
 * Try to compile Java code via the backend.
 * Returns null if the backend is unreachable (caller should fall back to local transpiler).
 */
export async function compileJava(
  files: Array<{ path: string; content: string }>
): Promise<CompileResponse | null> {
  try {
    const resp = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, mode: 'transpile' }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      console.warn('[ApiClient] Backend returned', resp.status);
      return null;
    }

    return await resp.json();
  } catch (e) {
    // Backend unreachable — fall back to local transpiler
    console.warn('[ApiClient] Backend unreachable, falling back to local transpiler:', e);
    return null;
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const resp = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}
