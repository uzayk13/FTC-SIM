/**
 * Gradle Build File Parser
 *
 * Parses build.gradle and settings.gradle files from FTC projects
 * to extract dependency info, SDK version, and project structure.
 */

export interface GradleProjectInfo {
  /** FTCLib version if declared as dependency */
  ftclibVersion: string | null;
  /** FTC SDK version if found */
  sdkVersion: string | null;
  /** RoadRunner version if found */
  roadRunnerVersion: string | null;
  /** All declared dependencies */
  dependencies: string[];
  /** Detected source directory layout */
  sourceDir: string | null;
  /** compileSdkVersion */
  compileSdk: string | null;
  /** Any custom repositories */
  repositories: string[];
  /** Detected modules from settings.gradle */
  modules: string[];
}

/**
 * Parse a build.gradle file content and extract project metadata.
 */
export function parseBuildGradle(content: string): GradleProjectInfo {
  const info: GradleProjectInfo = {
    ftclibVersion: null,
    sdkVersion: null,
    roadRunnerVersion: null,
    dependencies: [],
    sourceDir: null,
    compileSdk: null,
    repositories: [],
    modules: [],
  };

  // Extract compileSdkVersion
  const compileSdkMatch = content.match(/compileSdk(?:Version)?\s+(\d+)/);
  if (compileSdkMatch) info.compileSdk = compileSdkMatch[1];

  // Extract dependencies
  const depRegex = /(?:implementation|api|compileOnly|runtimeOnly|annotationProcessor)\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = depRegex.exec(content)) !== null) {
    info.dependencies.push(match[1]);
  }

  // Extract project dependencies
  const projDepRegex = /implementation\s+project\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = projDepRegex.exec(content)) !== null) {
    info.dependencies.push(`project:${match[1]}`);
  }

  // Find FTCLib version
  for (const dep of info.dependencies) {
    if (dep.includes('ftclib') || dep.includes('arcrobotics')) {
      const versionMatch = dep.match(/:(\d+[\d.]+\d)$/);
      if (versionMatch) info.ftclibVersion = versionMatch[1];
    }
    if (dep.includes('RobotCore') || dep.includes('robotcore')) {
      const versionMatch = dep.match(/:(\d+[\d.]+\d)$/);
      if (versionMatch) info.sdkVersion = versionMatch[1];
    }
    if (dep.includes('road-runner') || dep.includes('roadrunner')) {
      const versionMatch = dep.match(/:(\d+[\d.]+\d)$/);
      if (versionMatch) info.roadRunnerVersion = versionMatch[1];
    }
  }

  // Extract repositories
  const repoRegex = /maven\s*\{[^}]*url\s*=?\s*['"]([^'"]+)['"]/g;
  while ((match = repoRegex.exec(content)) !== null) {
    info.repositories.push(match[1]);
  }

  // Detect source directory from sourceSet configs
  const srcDirMatch = content.match(/srcDirs?\s*=?\s*\[?\s*['"]([^'"]+)['"]/);
  if (srcDirMatch) info.sourceDir = srcDirMatch[1];

  return info;
}

/**
 * Parse settings.gradle to extract module list.
 */
export function parseSettingsGradle(content: string): string[] {
  const modules: string[] = [];
  const includeRegex = /include\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = includeRegex.exec(content)) !== null) {
    modules.push(match[1]);
  }
  return modules;
}

/**
 * From a collection of uploaded files, identify the Gradle project structure
 * and return organized file groups.
 */
export function analyzeProjectFiles(
  files: Array<{ path: string; content: string }>
): {
  gradleInfo: GradleProjectInfo | null;
  javaFiles: Array<{ path: string; content: string }>;
  jsFiles: Array<{ path: string; content: string }>;
  otherFiles: Array<{ path: string; content: string }>;
} {
  let gradleInfo: GradleProjectInfo | null = null;
  const javaFiles: Array<{ path: string; content: string }> = [];
  const jsFiles: Array<{ path: string; content: string }> = [];
  const otherFiles: Array<{ path: string; content: string }> = [];

  for (const file of files) {
    const name = file.path.toLowerCase();

    if (name.endsWith('build.gradle') || name.endsWith('build.gradle.kts')) {
      const parsed = parseBuildGradle(file.content);
      // Prefer TeamCode/build.gradle over root build.gradle
      if (!gradleInfo || name.includes('teamcode')) {
        gradleInfo = parsed;
      }
    } else if (name.endsWith('settings.gradle') || name.endsWith('settings.gradle.kts')) {
      const modules = parseSettingsGradle(file.content);
      if (gradleInfo) {
        gradleInfo.modules = modules;
      }
    } else if (name.endsWith('.java')) {
      javaFiles.push(file);
    } else if (name.endsWith('.js') || name.endsWith('.ts')) {
      jsFiles.push(file);
    } else {
      otherFiles.push(file);
    }
  }

  // Sort Java files: subsystems/utilities first, OpModes last
  // This helps with class dependency ordering
  javaFiles.sort((a, b) => {
    const aIsOpMode = /@(TeleOp|Autonomous)\b/.test(a.content) ||
      /extends\s+(OpMode|LinearOpMode|CommandOpMode)\b/.test(a.content);
    const bIsOpMode = /@(TeleOp|Autonomous)\b/.test(b.content) ||
      /extends\s+(OpMode|LinearOpMode|CommandOpMode)\b/.test(b.content);

    if (aIsOpMode && !bIsOpMode) return 1;
    if (!aIsOpMode && bIsOpMode) return -1;

    // Sort subsystems before commands
    const aIsSub = /extends\s+SubsystemBase\b/.test(a.content) ||
      /implements\s+Subsystem\b/.test(a.content);
    const bIsSub = /extends\s+SubsystemBase\b/.test(b.content) ||
      /implements\s+Subsystem\b/.test(b.content);
    if (aIsSub && !bIsSub) return -1;
    if (!aIsSub && bIsSub) return 1;

    return a.path.localeCompare(b.path);
  });

  return { gradleInfo, javaFiles, jsFiles, otherFiles };
}
