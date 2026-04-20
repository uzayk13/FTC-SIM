package com.ftcsimmer.model;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import java.util.List;

public record CompileRequest(
    @NotEmpty List<SourceFile> files,
    @Pattern(regexp = "validate|transpile") String mode
) {
    public CompileRequest {
        if (mode == null) mode = "transpile";
    }
}
