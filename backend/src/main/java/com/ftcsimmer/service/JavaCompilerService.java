package com.ftcsimmer.service;

import com.ftcsimmer.model.CompileError;
import com.ftcsimmer.model.SourceFile;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import javax.tools.*;
import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

@Service
public class JavaCompilerService {

    private final JavaCompiler compiler;
    private final List<JavaFileObject> stubFiles;

    @Value("${compile.timeout-seconds:10}")
    private int timeoutSeconds;

    @Value("${compile.java-release:17}")
    private int javaRelease;

    public JavaCompilerService() {
        this.compiler = ToolProvider.getSystemJavaCompiler();
        if (this.compiler == null) {
            throw new IllegalStateException(
                "No Java compiler available. Ensure the application runs on a JDK, not a JRE.");
        }
        this.stubFiles = loadStubFiles();
    }

    public CompilationResult compile(List<SourceFile> files) {
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();

        try (StandardJavaFileManager stdFm = compiler.getStandardFileManager(diagnostics, null, StandardCharsets.UTF_8)) {
            InMemoryFileManager fm = new InMemoryFileManager(stdFm);

            // Build compilation units: user files + FTC SDK stubs
            List<JavaFileObject> units = new ArrayList<>(stubFiles);
            for (SourceFile file : files) {
                String className = extractClassName(file.path(), file.content());
                units.add(new StringJavaFileObject(className, file.content()));
            }

            List<String> options = List.of(
                "--release", String.valueOf(javaRelease),
                "-proc:none"
            );

            JavaCompiler.CompilationTask task = compiler.getTask(
                null, fm, diagnostics, options, null, units);

            // Run compilation with timeout
            boolean success;
            ExecutorService executor = Executors.newSingleThreadExecutor();
            try {
                Future<Boolean> future = executor.submit(task::call);
                success = future.get(timeoutSeconds, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                return new CompilationResult(false,
                    List.of(new CompileError(null, 0, 0, "Compilation timed out after " + timeoutSeconds + "s", "ERROR")),
                    List.of());
            } catch (ExecutionException e) {
                return new CompilationResult(false,
                    List.of(new CompileError(null, 0, 0, "Compilation failed: " + e.getCause().getMessage(), "ERROR")),
                    List.of());
            } finally {
                executor.shutdownNow();
            }

            // Map diagnostics
            List<CompileError> errors = new ArrayList<>();
            List<CompileError> warnings = new ArrayList<>();

            for (Diagnostic<? extends JavaFileObject> d : diagnostics.getDiagnostics()) {
                // Skip diagnostics from stub files
                if (d.getSource() != null && d.getSource().getName().startsWith("/ftc-stubs/")) {
                    continue;
                }

                CompileError ce = new CompileError(
                    d.getSource() != null ? d.getSource().getName() : null,
                    d.getLineNumber(),
                    d.getColumnNumber(),
                    d.getMessage(null),
                    d.getKind().name()
                );

                if (d.getKind() == Diagnostic.Kind.ERROR) {
                    errors.add(ce);
                } else {
                    warnings.add(ce);
                }
            }

            return new CompilationResult(success && errors.isEmpty(), errors, warnings);

        } catch (IOException e) {
            return new CompilationResult(false,
                List.of(new CompileError(null, 0, 0, "IO error: " + e.getMessage(), "ERROR")),
                List.of());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new CompilationResult(false,
                List.of(new CompileError(null, 0, 0, "Compilation interrupted", "ERROR")),
                List.of());
        }
    }

    private String extractClassName(String path, String content) {
        // Try to get fully qualified class name from package + class name
        String pkg = "";
        var pkgMatch = java.util.regex.Pattern.compile("^\\s*package\\s+([\\w.]+)\\s*;", java.util.regex.Pattern.MULTILINE)
            .matcher(content);
        if (pkgMatch.find()) {
            pkg = pkgMatch.group(1) + ".";
        }

        // Match class, interface, enum, or annotation type
        var classMatch = java.util.regex.Pattern.compile(
            "(?:public\\s+)?(?:abstract\\s+)?(?:class|interface|enum|@interface)\\s+(\\w+)")
            .matcher(content);
        if (classMatch.find()) {
            return pkg + classMatch.group(1);
        }

        // Fallback: derive from file path
        String name = path.replaceAll(".*[/\\\\]", "").replace(".java", "");
        return pkg + name;
    }

    private List<JavaFileObject> loadStubFiles() {
        List<JavaFileObject> stubs = new ArrayList<>();
        try {
            PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources("classpath:ftc-stubs/**/*.java");
            for (Resource resource : resources) {
                String content = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
                // Extract class name from content
                String className = extractClassName(resource.getFilename(), content);
                stubs.add(new StringJavaFileObject("/ftc-stubs/" + className, content));
            }
        } catch (IOException e) {
            System.err.println("Warning: Could not load FTC SDK stubs: " + e.getMessage());
        }
        return stubs;
    }

    // ── In-memory file objects ──

    private static class StringJavaFileObject extends SimpleJavaFileObject {
        private final String content;

        StringJavaFileObject(String className, String content) {
            super(URI.create("string:///" + className.replace('.', '/') + Kind.SOURCE.extension),
                Kind.SOURCE);
            this.content = content;
        }

        @Override
        public CharSequence getCharContent(boolean ignoreEncodingErrors) {
            return content;
        }
    }

    /**
     * File manager that discards compiled class output (we never need .class files).
     */
    private static class InMemoryFileManager extends ForwardingJavaFileManager<StandardJavaFileManager> {
        InMemoryFileManager(StandardJavaFileManager fm) {
            super(fm);
        }

        @Override
        public JavaFileObject getJavaFileForOutput(Location location, String className,
                                                    JavaFileObject.Kind kind, FileObject sibling) {
            // Discard all class file output
            return new SimpleJavaFileObject(
                URI.create("mem:///" + className.replace('.', '/') + kind.extension), kind) {
                @Override
                public OutputStream openOutputStream() {
                    return new ByteArrayOutputStream(); // write to nowhere
                }
            };
        }
    }

    public record CompilationResult(
        boolean success,
        List<CompileError> errors,
        List<CompileError> warnings
    ) {}
}
