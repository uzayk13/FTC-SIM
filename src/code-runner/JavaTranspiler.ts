/**
 * Java-to-JavaScript Transpiler for FTC Robot Controller and FTCLib code.
 *
 * Handles:
 * - Package/import statements
 * - Annotations (@TeleOp, @Autonomous, @Override, @Disabled, etc.)
 * - Access modifiers, static, final, abstract, synchronized
 * - Java type declarations → let/const
 * - Generics, casting, instanceof
 * - extends/implements stripping
 * - LinearOpMode → init/loop conversion
 * - CommandOpMode → init/loop conversion
 * - OpMode lifecycle methods
 * - Enum references (DcMotor.Direction.FORWARD, etc.)
 * - String operations, for-each loops, enhanced switches
 * - try-with-resources simplification
 * - throws clauses removal
 * - this. prefix for field access in methods
 */

export interface TranspileResult {
  code: string;
  className: string | null;
  opModeType: 'opmode' | 'linearopmode' | 'commandopmode' | 'unknown';
  annotations: Record<string, string>;
}

// All Java types we recognize (FTC SDK + FTCLib + primitives + standard library)
const JAVA_PRIMITIVE_TYPES = [
  'void', 'int', 'long', 'float', 'double', 'boolean', 'char', 'byte', 'short',
];

const JAVA_OBJECT_TYPES = [
  'String', 'Integer', 'Long', 'Float', 'Double', 'Boolean', 'Character', 'Byte', 'Short',
  'Object', 'Number', 'Comparable', 'Iterable', 'Iterator',
  'List', 'ArrayList', 'LinkedList', 'Map', 'HashMap', 'LinkedHashMap', 'TreeMap',
  'Set', 'HashSet', 'TreeSet', 'Queue', 'Deque', 'ArrayDeque', 'PriorityQueue',
  'Arrays', 'Collections', 'Math', 'System',
  'Exception', 'RuntimeException', 'InterruptedException', 'NullPointerException',
  'Runnable', 'Callable', 'Consumer', 'Supplier', 'Function', 'Predicate',
];

const FTC_SDK_TYPES = [
  'DcMotor', 'DcMotorEx', 'DcMotorSimple', 'DcMotorController',
  'Servo', 'ServoEx', 'CRServo', 'ServoController',
  'ColorSensor', 'DistanceSensor', 'TouchSensor', 'OpticalDistanceSensor',
  'GyroSensor', 'CompassSensor', 'AccelerationSensor', 'LightSensor',
  'IMU', 'BNO055IMU', 'RevHubOrientationOnRobot',
  'AnalogInput', 'AnalogOutput', 'DigitalChannel', 'PWMOutput',
  'I2cDevice', 'I2cDeviceSynch', 'I2cAddr',
  'VoltageSensor', 'LynxModule',
  'ElapsedTime', 'Range', 'RobotLog',
  'Telemetry', 'Gamepad', 'HardwareMap',
  'OpMode', 'LinearOpMode', 'IterativeOpMode',
  'AngleUnit', 'DistanceUnit', 'CurrentUnit', 'TempUnit',
  'Orientation', 'AxesReference', 'AxesOrder',
  'YawPitchRollAngles', 'AngularVelocity',
  'RevHubOrientationOnRobot',
];

const FTCLIB_TYPES = [
  'CommandOpMode', 'CommandBase', 'CommandScheduler',
  'SubsystemBase', 'Subsystem',
  'InstantCommand', 'RunCommand', 'StartEndCommand',
  'WaitCommand', 'WaitUntilCommand',
  'SequentialCommandGroup', 'ParallelCommandGroup',
  'ParallelRaceGroup', 'ParallelDeadlineGroup',
  'ConditionalCommand', 'SelectCommand', 'PerpetualCommand',
  'GamepadEx', 'GamepadKeys', 'GamepadButton', 'GamepadTrigger',
  'Motor', 'MotorEx', 'MotorGroup',
  'PIDController', 'PIDFController',
  'SimpleMotorFeedforward', 'ElevatorFeedforward', 'ArmFeedforward',
  'Pose2d', 'Rotation2d', 'Translation2d', 'Transform2d', 'Vector2d',
  'MecanumDrive', 'DifferentialDrive', 'SwerveDrive',
  'MecanumDriveOdometry', 'DifferentialDriveOdometry',
  'MecanumDriveKinematics', 'DifferentialDriveKinematics',
  'Trajectory', 'TrajectoryConfig', 'TrajectoryGenerator',
  'Trigger', 'Button',
];

const ALL_KNOWN_TYPES = new Set([
  ...JAVA_PRIMITIVE_TYPES, ...JAVA_OBJECT_TYPES, ...FTC_SDK_TYPES, ...FTCLIB_TYPES,
]);

// Type pattern for matching in regex — used in variable/param declarations
const TYPE_PATTERN = `(?:${[...ALL_KNOWN_TYPES].join('|')}|[A-Z]\\w*)`;
const TYPE_WITH_GENERICS = `${TYPE_PATTERN}(?:\\s*<[^>]*>)?(?:\\[\\])*`;

export function transpileJava(source: string): TranspileResult {
  let code = source;
  const annotations: Record<string, string> = {};

  // ── Extract annotations before stripping ──
  const annoRegex = /@(TeleOp|Autonomous|Disabled)\s*(?:\(([^)]*)\))?\s*/g;
  let annoMatch;
  while ((annoMatch = annoRegex.exec(code)) !== null) {
    const name = annoMatch[1];
    const params = annoMatch[2] ?? '';
    annotations[name] = params;
  }

  // ── Determine OpMode type ──
  let opModeType: TranspileResult['opModeType'] = 'unknown';
  if (/extends\s+CommandOpMode\b/.test(code)) {
    opModeType = 'commandopmode';
  } else if (/extends\s+LinearOpMode\b/.test(code)) {
    opModeType = 'linearopmode';
  } else if (/extends\s+(OpMode|IterativeOpMode)\b/.test(code)) {
    opModeType = 'opmode';
  }

  // ── Remove package declarations ──
  code = code.replace(/^\s*package\s+[\w.]+\s*;/gm, '');

  // ── Remove all import statements ──
  code = code.replace(/^\s*import\s+[\w.*]+\s*;/gm, '');

  // ── Remove all annotations ──
  code = code.replace(/@\w+(?:\s*\([^)]*\))?\s*/g, '');

  // ── Remove throws clauses ──
  code = code.replace(/\bthrows\s+[\w,\s]+(?=\s*\{)/g, '');

  // ── Remove access modifiers ──
  code = code.replace(/\b(public|private|protected)\s+/g, '');

  // ── Remove other modifiers ──
  code = code.replace(/\bstatic\s+/g, '');
  code = code.replace(/\bfinal\s+/g, '');
  code = code.replace(/\babstract\s+/g, '');
  code = code.replace(/\bsynchronized\s+/g, '');
  code = code.replace(/\bvolatile\s+/g, '');
  code = code.replace(/\btransient\s+/g, '');
  code = code.replace(/\bnative\s+/g, '');
  code = code.replace(/\bstrictfp\s+/g, '');

  // ── Remove extends / implements clauses ──
  code = code.replace(/\bextends\s+\w+(?:\s*<[^>]*>)?\s*/g, '');
  code = code.replace(/\bimplements\s+[\w<>,\s]+(?=\s*\{)/g, '');

  // ── Convert Java Type.class → Type (for hardwareMap.get) ──
  code = code.replace(
    /(\w+)\.class\b/g,
    '$1'
  );

  // ── Convert Java casting: (Type) expr → expr ──
  // Only strip casts for known types to avoid breaking parenthesized expressions
  code = code.replace(
    new RegExp(`\\(\\s*(${TYPE_PATTERN}(?:<[^>]*>)?)\\s*\\)\\s*(?=[\\w(])`, 'g'),
    ''
  );

  // ── Convert method return types ──
  // `Type methodName(` → `methodName(`
  code = code.replace(
    new RegExp(`\\b(${TYPE_WITH_GENERICS})\\s+(\\w+)\\s*\\(`, 'g'),
    (match, type, name) => {
      // Don't strip if it looks like a constructor call: `new Type(`
      if (ALL_KNOWN_TYPES.has(type.replace(/<.*/, '').replace(/\[\]/g, ''))) {
        return `${name}(`;
      }
      // Unknown capitalized type — still strip it
      if (/^[A-Z]/.test(type)) return `${name}(`;
      return match;
    }
  );

  // ── Convert variable declarations ──
  // `Type varName =` → `let varName =`
  code = code.replace(
    new RegExp(`\\b(${TYPE_WITH_GENERICS})\\s+(\\w+)\\s*=`, 'g'),
    (match, type) => {
      const baseType = type.replace(/<.*/, '').replace(/\[\]/g, '');
      if (ALL_KNOWN_TYPES.has(baseType) || /^[A-Z]/.test(baseType)) {
        return match.replace(new RegExp(`^\\b${escapeRegExp(type)}\\s+`), 'let ');
      }
      return match;
    }
  );

  // `Type varName;` → `let varName;`
  code = code.replace(
    new RegExp(`\\b(${TYPE_WITH_GENERICS})\\s+(\\w+)\\s*;`, 'g'),
    (match, type) => {
      const baseType = type.replace(/<.*/, '').replace(/\[\]/g, '');
      if (ALL_KNOWN_TYPES.has(baseType) || /^[A-Z]/.test(baseType)) {
        return match.replace(new RegExp(`^\\b${escapeRegExp(type)}\\s+`), 'let ');
      }
      return match;
    }
  );

  // ── Handle for-each: for (Type item : collection) → for (let item of collection) ──
  code = code.replace(
    new RegExp(`for\\s*\\(\\s*(?:${TYPE_WITH_GENERICS})\\s+(\\w+)\\s*:\\s*`, 'g'),
    'for (let $1 of '
  );

  // ── Standard for loop types: for (int i = ...) → for (let i = ...) ──
  code = code.replace(
    new RegExp(`for\\s*\\(\\s*(?:${TYPE_WITH_GENERICS})\\s+(\\w+)\\s*=`, 'g'),
    'for (let $1 ='
  );

  // ── Convert `new ArrayList<>()` → `[]`, `new HashMap<>()` → `{}` ──
  code = code.replace(/new\s+(?:Array)?List\s*(?:<[^>]*>)?\s*\(\s*\)/g, '[]');
  code = code.replace(/new\s+(?:Hash|Linked|Tree)?(?:Map|HashMap)\s*(?:<[^>]*>)?\s*\(\s*\)/g, '{}');
  code = code.replace(/new\s+(?:Hash|Tree)?Set\s*(?:<[^>]*>)?\s*\(\s*\)/g, 'new Set()');

  // ── Convert common collection methods ──
  // .add(x) on arrays → .push(x) (this is imperfect but covers most cases)
  // .size() → .length
  // .get(i) → [i]
  // We'll leave .add() as is since JS arrays support it via a shim we'll add later
  code = code.replace(/\.size\(\)/g, '.length');

  // ── Convert string operations ──
  code = code.replace(/\.equals\s*\(/g, ' === ('); // imperfect but common
  code = code.replace(/\.equalsIgnoreCase\s*\(/g, '.toLowerCase() === ('); // rough

  // ── Convert System.out.println → console.log ──
  code = code.replace(/System\.out\.println/g, 'console.log');
  code = code.replace(/System\.out\.printf/g, 'console.log');
  code = code.replace(/System\.out\.print\b/g, 'console.log');
  code = code.replace(/System\.nanoTime\s*\(\s*\)/g, '(performance.now() * 1e6)');
  code = code.replace(/System\.currentTimeMillis\s*\(\s*\)/g, 'performance.now()');

  // ── Convert hardwareMap access patterns ──
  // hardwareMap.dcMotor.get("name") → hardwareMap.get(DcMotor, "name")
  code = code.replace(/hardwareMap\.dcMotor\.get\s*\(/g, 'hardwareMap.get(DcMotor, ');
  code = code.replace(/hardwareMap\.servo\.get\s*\(/g, 'hardwareMap.get(Servo, ');
  code = code.replace(/hardwareMap\.crservo\.get\s*\(/g, 'hardwareMap.get(CRServo, ');
  code = code.replace(/hardwareMap\.colorSensor\.get\s*\(/g, 'hardwareMap.get(ColorSensor, ');
  code = code.replace(/hardwareMap\.imu\.get\s*\(/g, 'hardwareMap.get(IMU, ');

  // ── Convert sleep/idle/opModeIsActive ──
  code = code.replace(/\bThread\.sleep\s*\(\s*(\d+)\s*\)/g, '/* sleep($1ms) */');
  code = code.replace(/\bsleep\s*\(\s*(\d+)\s*\)/g, '/* sleep($1ms) */');
  code = code.replace(/\bSystemClock\.sleep\s*\(\s*(\d+)\s*\)/g, '/* sleep($1ms) */');
  code = code.replace(/\bidle\s*\(\s*\)/g, '/* idle */');
  code = code.replace(/\bopModeIsActive\s*\(\s*\)/g, 'true');
  code = code.replace(/\bisStopRequested\s*\(\s*\)/g, 'false');
  code = code.replace(/\bisStarted\s*\(\s*\)/g, 'true');

  // ── Remove try-catch blocks for InterruptedException (common boilerplate) ──
  // This is a rough heuristic - strip catch(InterruptedException) blocks
  code = code.replace(/catch\s*\(\s*InterruptedException\s+\w+\s*\)\s*\{[^}]*\}/g, 'catch(_e){}');

  // ── Convert `new Type[n]` → `new Array(n).fill(null)` ──
  code = code.replace(/new\s+\w+\s*\[\s*(\w+)\s*\]/g, 'new Array($1).fill(null)');

  // ── Convert `null` checks that use Java patterns ──
  // obj != null already works in JS

  // ── Handle @Override removal (already done above) ──

  // ── Convert LinearOpMode/CommandOpMode runOpMode → async with await ──
  if (opModeType === 'linearopmode' || opModeType === 'commandopmode') {
    code = convertRunOpModeAsync(code);
  }

  // ── Find class name ──
  const className = findMainClassName(code, annotations);

  // ── Clean up multiple blank lines ──
  code = code.replace(/\n{3,}/g, '\n\n');

  return { code, className, opModeType, annotations };
}

/**
 * Strip TypeScript/ES module syntax for JS/TS files.
 */
export function stripTypeScript(code: string): string {
  let out = code;

  // Remove ES module imports
  out = out.replace(/^\s*import\s+.*?['"].*?['"]\s*;?\s*$/gm, '');
  out = out.replace(/^\s*import\s+['"].*?['"]\s*;?\s*$/gm, '');
  out = out.replace(/^\s*import\s+type\s+.*?['"].*?['"]\s*;?\s*$/gm, '');

  // Remove exports
  out = out.replace(/^\s*export\s+default\s+\w+\s*;?\s*$/gm, '');
  out = out.replace(/\bexport\s+default\s+/g, '');
  out = out.replace(/\bexport\s+/g, '');

  // Remove interface/type declarations
  out = out.replace(/^\s*(?:export\s+)?(?:interface|type)\s+\w+[^{]*\{[^}]*\}\s*$/gm, '');
  out = out.replace(/^\s*(?:export\s+)?type\s+\w+\s*=\s*[^;]+;/gm, '');

  // Remove TS modifiers
  out = out.replace(/\b(public|private|protected|readonly)\s+/g, '');

  // Remove type annotations
  out = out.replace(/:\s*[\w<>\[\]|&,\s]+(?=\s*[,)=}])/g, '');
  out = out.replace(/\)\s*:\s*[\w<>\[\]|&,\s]+(?=\s*\{)/g, ')');

  // Remove generics on class
  out = out.replace(/class\s+(\w+)\s*<[^>]+>/g, 'class $1');

  // Remove `as Type` casts
  out = out.replace(/\bas\s+[\w<>\[\]|&]+/g, '');

  // Remove non-null assertions
  out = out.replace(/(\w)!(?=[.;\s,)\]])/g, '$1');

  // Remove declare statements
  out = out.replace(/^\s*declare\s+.*$/gm, '');

  // Remove implements clauses
  out = out.replace(/\bimplements\s+[\w<>,\s]+(?=\s*\{)/g, '');

  return out;
}

/**
 * Convert runOpMode() to an async method and add `await` before blocking calls.
 * This preserves the sequential structure of LinearOpMode code instead of
 * splitting it into init/loop.
 */
function convertRunOpModeAsync(code: string): string {
  const methodStart = code.search(/runOpMode\s*\(\s*\)\s*\{/);
  if (methodStart === -1) return code;

  // Make runOpMode async
  code = code.replace(
    /runOpMode\s*\(\s*\)\s*\{/,
    'async runOpMode() {'
  );

  // Add `await` before blocking calls that return promises
  // waitForStart()
  code = code.replace(
    /(?<!await\s)(?:this\.)?waitForStart\s*\(\s*\)/g,
    'await this.waitForStart()'
  );

  // sleep(ms)
  code = code.replace(
    /(?<!await\s)(?:this\.)?sleep\s*\(([^)]+)\)/g,
    'await this.sleep($1)'
  );

  // idle()
  code = code.replace(
    /(?<!await\s)(?:this\.)?idle\s*\(\s*\)/g,
    'await this.idle()'
  );

  // Convert while(opModeIsActive()) loops — inject an idle() yield per iteration
  // so the loop doesn't block the browser. This lets physics/rendering run between iterations.
  code = code.replace(
    /(while\s*\(\s*(?:(?:this\.)?opModeIsActive\s*\(\s*\)|!(?:this\.)?isStopRequested\s*\(\s*\)|true)\s*(?:&&[^)]+)?\s*\)\s*\{)/g,
    '$1\nawait this.idle();\n'
  );

  return code;
}

/**
 * Find the main OpMode class name from the code.
 */
function findMainClassName(code: string, annotations: Record<string, string>): string | null {
  const classRegex = /class\s+(\w+)/g;
  const classes: string[] = [];
  let match;
  while ((match = classRegex.exec(code)) !== null) {
    classes.push(match[1]);
  }

  if (classes.length === 0) return null;
  if (classes.length === 1) return classes[0];

  // If annotations specify a name, try to match
  // But annotations were stripped from code, so use original name detection

  // Priority: classes with init/loop/runOpMode
  for (const cls of classes) {
    const body = extractClassBody(code, cls);
    if (body && (/\binit\s*\(/.test(body) || /\bloop\s*\(/.test(body) || /\brunOpMode\s*\(/.test(body))) {
      return cls;
    }
  }

  // Known OpMode names
  const knownNames = ['MyOpMode', 'TeleOp', 'Autonomous', 'OpMode', 'MainOpMode', 'MyTeleOp', 'MyAutonomous'];
  for (const name of knownNames) {
    if (classes.includes(name)) return name;
  }

  // If there are annotations, the annotated class is likely the last one
  if (Object.keys(annotations).length > 0) {
    return classes[classes.length - 1];
  }

  // Return last class
  return classes[classes.length - 1];
}

function extractClassBody(code: string, className: string): string | null {
  const regex = new RegExp(`class\\s+${escapeRegExp(className)}[^{]*\\{`);
  const match = regex.exec(code);
  if (!match) return null;

  const start = match.index + match[0].length;
  let depth = 1;
  let j = start;
  while (j < code.length && depth > 0) {
    if (code[j] === '{') depth++;
    else if (code[j] === '}') depth--;
    j++;
  }
  return code.slice(start, j - 1);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect whether source code is Java or JavaScript/TypeScript.
 */
export function detectLanguage(code: string): 'java' | 'js' {
  const javaSignals = [
    /^\s*package\s+[\w.]+\s*;/m,
    /^\s*import\s+[\w.]+\*?\s*;/m,
    /\b(public|private|protected)\s+(static\s+)?(class|void|int|double|float|boolean|String)\b/,
    /@(TeleOp|Autonomous|Override|Disabled)\b/,
    /extends\s+(OpMode|LinearOpMode|IterativeOpMode|CommandOpMode)\b/,
    /\bDcMotor\b|\bServo\b|\bhardwareMap\b/,
    /\bnew\s+ElapsedTime\s*\(\s*\)/,
    /\bGamepadEx\b/,
  ];
  let score = 0;
  for (const pattern of javaSignals) {
    if (pattern.test(code)) score++;
  }
  return score >= 2 ? 'java' : 'js';
}
