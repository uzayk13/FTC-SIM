import type { Engine } from '../core/Engine';
import { createFtcRuntime, type FtcRuntimeContext } from './FtcRuntime';
import { transpileJava, stripTypeScript, detectLanguage } from './JavaTranspiler';
import { analyzeProjectFiles } from './GradleParser';
import { compileJava } from '../api/ApiClient';

interface OpMode {
  init?(robot: any): void;
  loop?(robot: any, gamepad1: any, gamepad2: any): void;
  stop?(robot: any): void;
  start?(): void;
  init_loop?(): void;
  runOpMode?(): Promise<void>;
  _isLinear?: boolean;
}

export interface ProjectFile {
  path: string;
  content: string;
}

export class CodeRunner {
  engine: Engine;
  running = false;
  private opMode: OpMode | null = null;
  private ftcRuntime: FtcRuntimeContext | null = null;
  private outputEl: HTMLElement | null;
  private _linearRunning = false; // True while a LinearOpMode's runOpMode() is executing
  private _stopRequested = false;

  constructor(engine: Engine) {
    this.engine = engine;
    this.outputEl = document.getElementById('code-output');
  }

  /**
   * Load and run a single source file.
   */
  loadAndRun(rawCode: string) {
    this.loadProject([{ path: 'OpMode.java', content: rawCode }]);
  }

  /**
   * Load and run a multi-file project.
   * Handles Gradle projects, multiple Java files, JS/TS files.
   */
  loadProject(files: ProjectFile[]) {
    this.stop();
    this.clearLog();
    this.log('Analyzing project...');

    try {
      const { gradleInfo, javaFiles, jsFiles } = analyzeProjectFiles(files);

      if (gradleInfo) {
        this.log('Found Gradle project configuration');
        if (gradleInfo.ftclibVersion) this.log(`  FTCLib: v${gradleInfo.ftclibVersion}`);
        if (gradleInfo.sdkVersion) this.log(`  FTC SDK: v${gradleInfo.sdkVersion}`);
        if (gradleInfo.roadRunnerVersion) this.log(`  Road Runner: v${gradleInfo.roadRunnerVersion}`);
        if (gradleInfo.dependencies.length > 0) {
          this.log(`  Dependencies: ${gradleInfo.dependencies.length} found`);
        }
      }

      // Determine what to compile
      if (javaFiles.length > 0) {
        this.log(`Compiling ${javaFiles.length} Java file(s)...`);
        this.compileJavaProject(javaFiles);
      } else if (jsFiles.length > 0) {
        this.log(`Compiling ${jsFiles.length} JS/TS file(s)...`);
        this.compileJsProject(jsFiles);
      } else {
        // Try auto-detecting single file
        const singleFile = files.find(f =>
          !f.path.toLowerCase().endsWith('.gradle') &&
          !f.path.toLowerCase().endsWith('.gradle.kts') &&
          !f.path.toLowerCase().endsWith('.xml') &&
          !f.path.toLowerCase().endsWith('.json') &&
          !f.path.toLowerCase().endsWith('.md') &&
          !f.path.toLowerCase().endsWith('.txt') &&
          !f.path.toLowerCase().endsWith('.gitignore')
        );
        if (singleFile) {
          const lang = detectLanguage(singleFile.content);
          if (lang === 'java') {
            this.compileJavaProject([singleFile]);
          } else {
            this.compileJsProject([singleFile]);
          }
        } else {
          this.log('Error: No compilable source files found in the uploaded project.');
          this.log('Expected .java, .js, or .ts files.');
        }
      }
    } catch (e: any) {
      this.log(`Project error: ${e.message}`);
    }
  }

  /**
   * Compile and run multiple Java files (FTC SDK / FTCLib).
   * Tries the backend compiler first; falls back to local regex transpiler.
   */
  private compileJavaProject(files: ProjectFile[]) {
    // Initialize FTC runtime
    this.ftcRuntime = createFtcRuntime(this.engine);

    // Try backend compilation first
    this.log('Attempting server-side compilation...');
    compileJava(files).then((response) => {
      if (response && response.success && response.transpiledCode) {
        this.log('Server compilation successful.');
        if (response.warnings.length > 0) {
          for (const w of response.warnings) {
            this.log(`  Warning: ${w.file ?? ''}:${w.line} - ${w.message}`);
          }
        }
        this.log(`Main OpMode: ${response.className} (${response.opModeType})`);
        this.executeWithRuntime(response.transpiledCode, response.className!);
      } else if (response && !response.success) {
        // Backend returned compilation errors
        this.log('Compilation errors:');
        for (const err of response.errors) {
          const loc = err.file ? `${err.file}:${err.line}:${err.column}` : `line ${err.line}`;
          this.log(`  ${loc} - ${err.message}`);
        }
      } else {
        // Backend unreachable — fall back to local transpiler
        this.log('Backend unavailable, using local transpiler...');
        this.compileJavaLocal(files);
      }
    });
  }

  /**
   * Local (regex-based) Java transpilation fallback.
   */
  private compileJavaLocal(files: ProjectFile[]) {
    const transpiled: Array<{ path: string; code: string; className: string | null; isOpMode: boolean }> = [];
    let mainOpModeClass: string | null = null;
    let mainOpModeType: string = 'unknown';

    for (const file of files) {
      try {
        const result = transpileJava(file.content);
        const isOpMode = result.opModeType !== 'unknown' ||
          Object.keys(result.annotations).some(a => a === 'TeleOp' || a === 'Autonomous');

        transpiled.push({
          path: file.path,
          code: result.code,
          className: result.className,
          isOpMode,
        });

        if (result.className) {
          this.log(`  ${file.path.split('/').pop()}: class ${result.className}${isOpMode ? ' (OpMode)' : ''}`);
        }

        if (isOpMode && result.className) {
          mainOpModeClass = result.className;
          mainOpModeType = result.opModeType;
        }
      } catch (e: any) {
        this.log(`  Error in ${file.path}: ${e.message}`);
      }
    }

    if (!mainOpModeClass) {
      for (let i = transpiled.length - 1; i >= 0; i--) {
        if (transpiled[i].className) {
          mainOpModeClass = transpiled[i].className;
          break;
        }
      }
    }

    if (!mainOpModeClass) {
      this.log('Error: No OpMode class found in uploaded files.');
      this.log('Ensure your code has a class annotated with @TeleOp or @Autonomous,');
      this.log('or a class extending OpMode/LinearOpMode/CommandOpMode.');
      return;
    }

    this.log(`Main OpMode: ${mainOpModeClass} (${mainOpModeType})`);

    const allCode = transpiled
      .sort((a, b) => (a.isOpMode ? 1 : 0) - (b.isOpMode ? 1 : 0))
      .map(t => t.code)
      .join('\n\n');

    this.executeWithRuntime(allCode, mainOpModeClass);
  }

  /**
   * Compile and run JS/TS files.
   */
  private compileJsProject(files: ProjectFile[]) {
    // Initialize FTC runtime (in case JS code uses FTC-style APIs)
    this.ftcRuntime = createFtcRuntime(this.engine);

    let allCode = '';
    let mainClass: string | null = null;

    for (const file of files) {
      const stripped = stripTypeScript(file.content);
      allCode += stripped + '\n\n';

      // Find classes
      const classRegex = /class\s+(\w+)/g;
      let match;
      while ((match = classRegex.exec(stripped)) !== null) {
        mainClass = match[1]; // Last class found
      }
    }

    if (!mainClass) {
      this.log('Error: No class found in uploaded code.');
      this.log('Define a class with init(robot) and/or loop(robot, gamepad1, gamepad2) methods.');
      return;
    }

    this.log(`Found class: ${mainClass}`);
    this.executeWithRuntime(allCode, mainClass);
  }

  /**
   * Execute transpiled code with the FTC runtime injected.
   */
  private executeWithRuntime(code: string, className: string) {
    const rt = this.ftcRuntime!;

    // Build the preamble that injects all runtime classes into scope
    const classNames = Object.keys(rt.classes);
    const destructure = classNames.map(name => `  const ${name} = __rt.classes.${name};`).join('\n');

    // Add Array.prototype.add polyfill for Java's List.add()
    const polyfills = `
      if (!Array.prototype.add) {
        Array.prototype.add = function(item) { this.push(item); return true; };
      }
      if (!Array.prototype.get) {
        Array.prototype.get = function(i) { return this[i]; };
      }
      if (!Array.prototype.remove) {
        Array.prototype.remove = function(i) {
          if (typeof i === 'number') return this.splice(i, 1)[0];
          const idx = this.indexOf(i);
          if (idx >= 0) { this.splice(idx, 1); return true; }
          return false;
        };
      }
      if (!Array.prototype.contains) {
        Array.prototype.contains = function(item) { return this.includes(item); };
      }
      if (!Array.prototype.isEmpty) {
        Array.prototype.isEmpty = function() { return this.length === 0; };
      }
    `;

    const wrappedCode = `
      // FTC Runtime
      const hardwareMap = __rt.hardwareMap;
      const telemetry = __rt.telemetry;
      const gamepad1 = __rt.gamepad1;
      const gamepad2 = __rt.gamepad2;
      const runtime = __rt.runtime;

      // All SDK + FTCLib classes
${destructure}

      // Java compatibility polyfills
${polyfills}

      // OpMode base class stub
      class OpMode {
        init() {}
        init_loop() {}
        start() {}
        loop() {}
        stop() {}
      }
      class LinearOpMode extends OpMode {
        _isLinear = true;
        _stopRequested = false;
        _started = false;

        waitForStart() {
          this._started = true;
          // Returns a promise that resolves next frame (CodeRunner drives this)
          return new Promise(resolve => { this._waitResolve = resolve; });
        }
        opModeIsActive() { return this._started && !this._stopRequested; }
        isStopRequested() { return this._stopRequested; }
        isStarted() { return this._started; }
        sleep(ms) {
          return new Promise(resolve => {
            this._sleepResolve = resolve;
            this._sleepUntil = performance.now() + ms;
          });
        }
        idle() {
          return new Promise(resolve => {
            this._idleResolve = resolve;
          });
        }
      }
      class IterativeOpMode extends OpMode {}
      class CommandOpMode extends LinearOpMode {
        constructor() {
          super();
          this.scheduler = CommandScheduler.getInstance();
        }
        schedule(...commands) { this.scheduler.schedule(...commands); }
        cancel(cmd) { this.scheduler.cancel(cmd); }
        cancelAll() { this.scheduler.cancelAll(); }
      }

      // User code
      ${code}
      ;

      // Instantiate the OpMode
      return new ${className}();
    `;

    try {
      const factory = new Function('__rt', wrappedCode);
      const instance = factory(rt);

      if (!instance) {
        this.log(`Error: Failed to instantiate ${className}.`);
        return;
      }

      // Detect available lifecycle methods
      const hasInit = typeof instance.init === 'function';
      const hasLoop = typeof instance.loop === 'function';
      const hasStop = typeof instance.stop === 'function';
      const hasStart = typeof instance.start === 'function';
      const hasInitLoop = typeof instance.init_loop === 'function';
      const hasRunOpMode = typeof instance.runOpMode === 'function';
      const isLinear = instance._isLinear === true;

      if (!hasInit && !hasLoop && !hasRunOpMode) {
        this.log(`Error: ${className} has no init(), loop(), or runOpMode() method.`);
        this.log('After transpilation, the class must have at least one lifecycle method.');
        return;
      }

      this.opMode = instance;
      const methods = [
        hasInit && 'init', hasInitLoop && 'init_loop', hasStart && 'start',
        hasLoop && 'loop', hasRunOpMode && 'runOpMode', hasStop && 'stop',
      ].filter(Boolean).join(', ');
      this.log(`Compiled OK. Methods: ${methods}${isLinear ? ' (LinearOpMode)' : ''}`);

      // Inject runtime objects onto instance
      (instance as any).hardwareMap = rt.hardwareMap;
      (instance as any).telemetry = rt.telemetry;
      (instance as any).gamepad1 = rt.gamepad1;
      (instance as any).gamepad2 = rt.gamepad2;
      (instance as any).runtime = rt.runtime;

      if (isLinear && hasRunOpMode) {
        // LinearOpMode: run runOpMode() as async, it will yield on
        // waitForStart(), sleep(), idle()
        this.running = true;
        this._linearRunning = true;
        this._stopRequested = false;
        this.log('LinearOpMode starting runOpMode()...');

        instance.runOpMode!().then(() => {
          this.log('runOpMode() completed.');
          this._linearRunning = false;
          this.stop();
        }).catch((e: any) => {
          if (e?.message === '__opmode_stopped__') {
            this.log('OpMode stopped.');
          } else {
            this.log(`Runtime error in runOpMode(): ${e.message}`);
            if (e.stack) {
              const line = extractLineFromStack(e.stack);
              if (line) this.log(`  at line ~${line}`);
            }
          }
          this._linearRunning = false;
          this.running = false;
        });
      } else {
        // Standard iterative OpMode
        if (hasInit) {
          try {
            this.opMode!.init(rt.hardwareMap);
            this.log('init() executed.');
          } catch (e: any) {
            this.log(`Error in init(): ${e.message}`);
            if (e.stack) {
              const line = extractLineFromStack(e.stack);
              if (line) this.log(`  at line ~${line}`);
            }
          }
        }

        if (hasStart) {
          try {
            this.opMode!.start();
          } catch (e: any) {
            this.log(`Error in start(): ${e.message}`);
          }
        }

        this.running = true;
        this.log('OpMode RUNNING.');
      }
    } catch (e: any) {
      let msg = e.message || String(e);
      if (e instanceof SyntaxError) {
        msg = `Syntax error: ${msg}`;
      }
      this.log(`Compile error: ${msg}`);
      if (e.stack) {
        const line = extractLineFromStack(e.stack);
        if (line) this.log(`  at line ~${line}`);
      }
      this.log('Tip: Ensure your code defines a class with init()/loop() methods.');
      this.log('For Java code, make sure it extends OpMode, LinearOpMode, or CommandOpMode.');
    }
  }

  update(_dt: number) {
    if (!this.running || !this.opMode) return;

    const rt = this.ftcRuntime;
    const instance = this.opMode as any;

    // Update gamepad references (they might change each frame)
    if (rt) {
      instance.gamepad1 = rt.gamepad1;
      instance.gamepad2 = rt.gamepad2;
    }

    // LinearOpMode: drive blocking resolves each frame
    if (this._linearRunning && instance._isLinear) {
      // Propagate stop
      if (this._stopRequested) {
        instance._stopRequested = true;
      }

      // Resolve waitForStart() — always resolve immediately (sim doesn't have a separate start phase)
      if (instance._waitResolve) {
        const resolve = instance._waitResolve;
        instance._waitResolve = null;
        instance._started = true;
        resolve();
      }

      // Resolve sleep() when time has elapsed
      if (instance._sleepResolve && instance._sleepUntil) {
        if (performance.now() >= instance._sleepUntil) {
          const resolve = instance._sleepResolve;
          instance._sleepResolve = null;
          instance._sleepUntil = null;
          resolve();
        }
      }

      // Resolve idle() — yields one frame then resumes
      if (instance._idleResolve) {
        const resolve = instance._idleResolve;
        instance._idleResolve = null;
        resolve();
      }

      // Sync motors each frame for LinearOpMode too
      if (rt) {
        rt.telemetry.update();
        rt.syncMotors();
      }
      return;
    }

    // Standard iterative OpMode
    if (this.opMode.loop) {
      try {
        this.opMode.loop(
          rt?.hardwareMap ?? null,
          this.engine.input.gamepad1,
          this.engine.input.gamepad2
        );

        // Sync motor powers → simulator robot
        if (rt) {
          rt.telemetry.update();
          rt.syncMotors();
        }
      } catch (e: any) {
        this.log(`Runtime error: ${e.message}`);
        if (e.stack) {
          const line = extractLineFromStack(e.stack);
          if (line) this.log(`  at line ~${line}`);
        }
        this.stop();
      }
    }
  }

  stop() {
    this._stopRequested = true;

    // Unblock any pending LinearOpMode awaits so it can exit
    if (this.opMode) {
      const instance = this.opMode as any;
      instance._stopRequested = true;
      if (instance._waitResolve) { instance._waitResolve(); instance._waitResolve = null; }
      if (instance._sleepResolve) { instance._sleepResolve(); instance._sleepResolve = null; }
      if (instance._idleResolve) { instance._idleResolve(); instance._idleResolve = null; }
    }

    if (this.running && this.opMode?.stop) {
      try {
        this.opMode.stop(this.ftcRuntime?.hardwareMap ?? null);
      } catch (e: any) {
        this.log(`Error in stop(): ${e.message}`);
      }
    }
    this.running = false;
    this._linearRunning = false;
    this.opMode = null;
    this.ftcRuntime = null;
    this.log('OpMode stopped.');
  }

  private clearLog() {
    if (this.outputEl) this.outputEl.textContent = '';
  }

  private log(msg: string) {
    if (this.outputEl) {
      this.outputEl.textContent = msg + '\n' + (this.outputEl.textContent ?? '');
      if (this.outputEl.textContent.length > 5000) {
        this.outputEl.textContent = this.outputEl.textContent.slice(0, 5000);
      }
    }
    console.log('[CodeRunner]', msg);
  }
}

/**
 * Try to extract a meaningful line number from a stack trace.
 */
function extractLineFromStack(stack: string): string | null {
  // Look for "anonymous>:123" or "Function:123" patterns
  const match = stack.match(/<anonymous>:(\d+)/);
  if (match) return match[1];
  const match2 = stack.match(/Function:(\d+)/);
  if (match2) return match2[1];
  return null;
}
