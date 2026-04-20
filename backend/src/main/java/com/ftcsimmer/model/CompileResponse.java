package com.ftcsimmer.model;

import java.util.List;
import java.util.Map;

public record CompileResponse(
    boolean success,
    String transpiledCode,
    String className,
    String opModeType,
    Map<String, String> annotations,
    List<CompileError> errors,
    List<CompileError> warnings
) {
    public static CompileResponse failure(List<CompileError> errors, List<CompileError> warnings) {
        return new CompileResponse(false, null, null, null, Map.of(), errors, warnings);
    }

    public static CompileResponse success(String transpiledCode, String className,
                                           String opModeType, Map<String, String> annotations,
                                           List<CompileError> warnings) {
        return new CompileResponse(true, transpiledCode, className, opModeType, annotations, List.of(), warnings);
    }

    public static CompileResponse validated(List<CompileError> warnings) {
        return new CompileResponse(true, null, null, null, Map.of(), List.of(), warnings);
    }
}
