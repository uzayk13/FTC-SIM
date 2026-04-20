package com.ftcsimmer.model;

import jakarta.validation.constraints.NotBlank;

public record SourceFile(
    @NotBlank String path,
    @NotBlank String content
) {}
