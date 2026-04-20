package com.ftcsimmer.model;

public record CompileError(
    String file,
    long line,
    long column,
    String message,
    String severity
) {}
