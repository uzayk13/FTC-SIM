package com.ftcsimmer.controller;

import com.ftcsimmer.model.CompileRequest;
import com.ftcsimmer.model.CompileResponse;
import com.ftcsimmer.service.JavaCompilerService;
import com.ftcsimmer.service.JavaTranspilerService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class CompileController {

    private final JavaCompilerService compilerService;
    private final JavaTranspilerService transpilerService;

    public CompileController(JavaCompilerService compilerService,
                             JavaTranspilerService transpilerService) {
        this.compilerService = compilerService;
        this.transpilerService = transpilerService;
    }

    @PostMapping("/compile")
    public ResponseEntity<CompileResponse> compile(@Valid @RequestBody CompileRequest request) {
        if (request.files().size() > 50) {
            return ResponseEntity.badRequest().body(
                CompileResponse.failure(
                    java.util.List.of(new com.ftcsimmer.model.CompileError(
                        null, 0, 0, "Too many files (max 50)", "ERROR")),
                    java.util.List.of()
                )
            );
        }

        // Step 1: Compile to validate
        var compileResult = compilerService.compile(request.files());

        if (!compileResult.success()) {
            return ResponseEntity.ok(CompileResponse.failure(
                compileResult.errors(), compileResult.warnings()));
        }

        // If validate-only mode, return success without transpilation
        if ("validate".equals(request.mode())) {
            return ResponseEntity.ok(CompileResponse.validated(compileResult.warnings()));
        }

        // Step 2: Transpile Java → JS using AST
        try {
            var transpileResult = transpilerService.transpile(request.files());
            return ResponseEntity.ok(CompileResponse.success(
                transpileResult.code(),
                transpileResult.className(),
                transpileResult.opModeType(),
                transpileResult.annotations(),
                compileResult.warnings()
            ));
        } catch (Exception e) {
            return ResponseEntity.ok(CompileResponse.failure(
                java.util.List.of(new com.ftcsimmer.model.CompileError(
                    null, 0, 0, "Transpilation error: " + e.getMessage(), "ERROR")),
                compileResult.warnings()
            ));
        }
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of(
            "status", "ok",
            "jdkVersion", System.getProperty("java.version")
        ));
    }
}
