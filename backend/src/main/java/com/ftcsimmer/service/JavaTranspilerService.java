package com.ftcsimmer.service;

import com.ftcsimmer.model.SourceFile;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.*;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class JavaTranspilerService {

    public TranspileResult transpile(List<SourceFile> files) {
        List<CompilationUnit> cus = new ArrayList<>();
        for (SourceFile file : files) {
            cus.add(StaticJavaParser.parse(file.content()));
        }

        // Find the main OpMode class
        String mainClassName = null;
        String opModeType = "unknown";
        Map<String, String> annotations = new LinkedHashMap<>();

        for (CompilationUnit cu : cus) {
            for (var type : cu.findAll(ClassOrInterfaceDeclaration.class)) {
                String detectedType = detectOpModeType(type);
                if (!"unknown".equals(detectedType)) {
                    mainClassName = type.getNameAsString();
                    opModeType = detectedType;
                    annotations = extractAnnotations(type);
                }
            }
        }

        // If no OpMode found, use the last class
        if (mainClassName == null) {
            for (CompilationUnit cu : cus) {
                var types = cu.findAll(ClassOrInterfaceDeclaration.class);
                if (!types.isEmpty()) {
                    mainClassName = types.get(types.size() - 1).getNameAsString();
                }
            }
        }

        // Transpile: non-OpMode classes first, then OpMode class
        StringBuilder js = new StringBuilder();
        List<CompilationUnit> opModeCUs = new ArrayList<>();
        List<CompilationUnit> otherCUs = new ArrayList<>();

        String finalMainClassName = mainClassName;
        for (CompilationUnit cu : cus) {
            boolean isOpMode = cu.findAll(ClassOrInterfaceDeclaration.class).stream()
                .anyMatch(t -> t.getNameAsString().equals(finalMainClassName));
            if (isOpMode) opModeCUs.add(cu);
            else otherCUs.add(cu);
        }

        JsEmitter emitter = new JsEmitter(opModeType);
        for (CompilationUnit cu : otherCUs) {
            emitter.emit(cu, js);
            js.append("\n\n");
        }
        for (CompilationUnit cu : opModeCUs) {
            emitter.emit(cu, js);
        }

        return new TranspileResult(
            js.toString().trim(),
            mainClassName,
            opModeType,
            annotations
        );
    }

    private String detectOpModeType(ClassOrInterfaceDeclaration type) {
        for (var ext : type.getExtendedTypes()) {
            String name = ext.getNameAsString();
            return switch (name) {
                case "LinearOpMode" -> "linearopmode";
                case "CommandOpMode" -> "commandopmode";
                case "OpMode", "IterativeOpMode" -> "opmode";
                default -> "unknown";
            };
        }
        // Check annotations
        for (var ann : type.getAnnotations()) {
            String name = ann.getNameAsString();
            if ("TeleOp".equals(name) || "Autonomous".equals(name)) {
                return "unknown"; // has annotation but no extends — still mark for detection
            }
        }
        return "unknown";
    }

    private Map<String, String> extractAnnotations(ClassOrInterfaceDeclaration type) {
        Map<String, String> result = new LinkedHashMap<>();
        for (var ann : type.getAnnotations()) {
            String name = ann.getNameAsString();
            if ("TeleOp".equals(name) || "Autonomous".equals(name) || "Disabled".equals(name)) {
                if (ann instanceof NormalAnnotationExpr normal) {
                    StringBuilder params = new StringBuilder();
                    for (var pair : normal.getPairs()) {
                        if (!params.isEmpty()) params.append(", ");
                        params.append(pair.getNameAsString()).append("=").append(pair.getValue());
                    }
                    result.put(name, params.toString());
                } else if (ann instanceof SingleMemberAnnotationExpr single) {
                    result.put(name, single.getMemberValue().toString());
                } else {
                    result.put(name, "");
                }
            }
        }
        return result;
    }

    /**
     * Emits JavaScript from Java AST nodes.
     */
    private static class JsEmitter extends VoidVisitorAdapter<StringBuilder> {
        private final String opModeType;
        private int indent = 0;

        JsEmitter(String opModeType) {
            this.opModeType = opModeType;
        }

        void emit(CompilationUnit cu, StringBuilder sb) {
            // Skip package and imports — emit class declarations directly
            for (var type : cu.getTypes()) {
                type.accept(this, sb);
                sb.append("\n");
            }
        }

        @Override
        public void visit(ClassOrInterfaceDeclaration n, StringBuilder sb) {
            line(sb, "class " + n.getNameAsString() + " {");
            indent++;

            // Collect field declarations for constructor initialization
            List<FieldDeclaration> fields = n.getFields();
            if (!fields.isEmpty()) {
                // Emit fields as class properties (no types)
                for (FieldDeclaration field : fields) {
                    for (var v : field.getVariables()) {
                        if (v.getInitializer().isPresent()) {
                            line(sb, v.getNameAsString() + " = " + emitExpr(v.getInitializer().get()) + ";");
                        } else {
                            line(sb, v.getNameAsString() + " = null;");
                        }
                    }
                }
                sb.append("\n");
            }

            // Emit constructors
            for (var ctor : n.getConstructors()) {
                emitConstructor(ctor, sb);
            }

            // Emit methods
            for (var method : n.getMethods()) {
                emitMethod(method, sb);
            }

            // Emit inner classes
            for (var inner : n.findAll(ClassOrInterfaceDeclaration.class)) {
                if (inner != n && inner.getParentNode().orElse(null) == n) {
                    sb.append("\n");
                    // Emit as a nested class (static inner)
                    visit(inner, sb);
                }
            }

            // Emit inner enums
            for (var enumDecl : n.findAll(EnumDeclaration.class)) {
                if (enumDecl.getParentNode().orElse(null) == n) {
                    emitEnum(enumDecl, sb);
                }
            }

            indent--;
            line(sb, "}");
        }

        @Override
        public void visit(EnumDeclaration n, StringBuilder sb) {
            emitEnum(n, sb);
        }

        private void emitEnum(EnumDeclaration n, StringBuilder sb) {
            // Emit enum as a frozen object
            line(sb, "static " + n.getNameAsString() + " = Object.freeze({");
            indent++;
            var entries = n.getEntries();
            for (int i = 0; i < entries.size(); i++) {
                String name = entries.get(i).getNameAsString();
                line(sb, name + ": '" + name + "'" + (i < entries.size() - 1 ? "," : ""));
            }
            indent--;
            line(sb, "});");
        }

        private void emitConstructor(ConstructorDeclaration ctor, StringBuilder sb) {
            line(sb, "constructor(" + emitParams(ctor.getParameters()) + ") {");
            indent++;

            // Check for super() call
            if (ctor.getBody().getStatements().size() > 0) {
                var first = ctor.getBody().getStatement(0);
                if (first instanceof ExplicitConstructorInvocationStmt superCall) {
                    line(sb, "super(" + emitArgs(superCall.getArguments()) + ");");
                }
            }

            for (var stmt : ctor.getBody().getStatements()) {
                if (stmt instanceof ExplicitConstructorInvocationStmt) continue; // already handled
                emitStatement(stmt, sb);
            }
            indent--;
            line(sb, "}");
            sb.append("\n");
        }

        private void emitMethod(MethodDeclaration method, StringBuilder sb) {
            String name = method.getNameAsString();
            boolean isAsync = false;

            // Make runOpMode async for LinearOpMode/CommandOpMode
            if ("runOpMode".equals(name) &&
                ("linearopmode".equals(opModeType) || "commandopmode".equals(opModeType))) {
                isAsync = true;
            }

            String prefix = isAsync ? "async " : "";
            line(sb, prefix + name + "(" + emitParams(method.getParameters()) + ") {");
            indent++;

            if (method.getBody().isPresent()) {
                for (var stmt : method.getBody().get().getStatements()) {
                    emitStatement(stmt, sb);
                }
            }

            indent--;
            line(sb, "}");
            sb.append("\n");
        }

        // ── Statement emission ──

        private void emitStatement(Statement stmt, StringBuilder sb) {
            if (stmt instanceof ExpressionStmt exprStmt) {
                line(sb, emitExpr(exprStmt.getExpression()) + ";");

            } else if (stmt instanceof ReturnStmt ret) {
                if (ret.getExpression().isPresent()) {
                    line(sb, "return " + emitExpr(ret.getExpression().get()) + ";");
                } else {
                    line(sb, "return;");
                }

            } else if (stmt instanceof IfStmt ifStmt) {
                emitIf(ifStmt, sb);

            } else if (stmt instanceof WhileStmt whileStmt) {
                emitWhile(whileStmt, sb);

            } else if (stmt instanceof ForStmt forStmt) {
                emitFor(forStmt, sb);

            } else if (stmt instanceof ForEachStmt forEach) {
                emitForEach(forEach, sb);

            } else if (stmt instanceof BlockStmt block) {
                line(sb, "{");
                indent++;
                for (var s : block.getStatements()) {
                    emitStatement(s, sb);
                }
                indent--;
                line(sb, "}");

            } else if (stmt instanceof SwitchStmt switchStmt) {
                emitSwitch(switchStmt, sb);

            } else if (stmt instanceof BreakStmt) {
                line(sb, "break;");

            } else if (stmt instanceof ContinueStmt) {
                line(sb, "continue;");

            } else if (stmt instanceof ThrowStmt throwStmt) {
                line(sb, "throw " + emitExpr(throwStmt.getExpression()) + ";");

            } else if (stmt instanceof TryStmt tryStmt) {
                emitTry(tryStmt, sb);

            } else if (stmt instanceof DoStmt doStmt) {
                line(sb, "do {");
                indent++;
                emitBlockBody(doStmt.getBody(), sb);
                indent--;
                line(sb, "} while (" + emitExpr(doStmt.getCondition()) + ");");

            } else if (stmt instanceof ExplicitConstructorInvocationStmt superStmt) {
                line(sb, "super(" + emitArgs(superStmt.getArguments()) + ");");

            } else {
                // Fallback: emit as-is (stripped of types via toString)
                line(sb, stmt.toString().trim());
            }
        }

        private void emitIf(IfStmt ifStmt, StringBuilder sb) {
            line(sb, "if (" + emitExpr(ifStmt.getCondition()) + ") {");
            indent++;
            emitBlockBody(ifStmt.getThenStmt(), sb);
            indent--;
            if (ifStmt.getElseStmt().isPresent()) {
                Statement elseStmt = ifStmt.getElseStmt().get();
                if (elseStmt instanceof IfStmt elseIf) {
                    sb.setLength(sb.length()); // keep going
                    indent(sb);
                    sb.append("} else ");
                    // Don't add newline — emitIf will handle it
                    emitIf(elseIf, sb);
                    return;
                } else {
                    line(sb, "} else {");
                    indent++;
                    emitBlockBody(elseStmt, sb);
                    indent--;
                }
            }
            line(sb, "}");
        }

        private void emitWhile(WhileStmt whileStmt, StringBuilder sb) {
            String cond = emitExpr(whileStmt.getCondition());

            // Check if this is a while(opModeIsActive()) pattern — inject idle()
            boolean needsIdle = cond.contains("opModeIsActive()") ||
                                cond.contains("isStopRequested()") ||
                                "true".equals(cond);

            line(sb, "while (" + cond + ") {");
            indent++;

            if (needsIdle && ("linearopmode".equals(opModeType) || "commandopmode".equals(opModeType))) {
                line(sb, "await this.idle();");
            }

            emitBlockBody(whileStmt.getBody(), sb);
            indent--;
            line(sb, "}");
        }

        private void emitFor(ForStmt forStmt, StringBuilder sb) {
            StringBuilder init = new StringBuilder();
            for (int i = 0; i < forStmt.getInitialization().size(); i++) {
                if (i > 0) init.append(", ");
                var expr = forStmt.getInitialization().get(i);
                if (expr instanceof VariableDeclarationExpr varDecl) {
                    init.append("let ");
                    for (int j = 0; j < varDecl.getVariables().size(); j++) {
                        if (j > 0) init.append(", ");
                        var v = varDecl.getVariables().get(j);
                        init.append(v.getNameAsString());
                        if (v.getInitializer().isPresent()) {
                            init.append(" = ").append(emitExpr(v.getInitializer().get()));
                        }
                    }
                } else {
                    init.append(emitExpr(expr));
                }
            }

            String cond = forStmt.getCompare().map(this::emitExpr).orElse("");
            StringBuilder update = new StringBuilder();
            for (int i = 0; i < forStmt.getUpdate().size(); i++) {
                if (i > 0) update.append(", ");
                update.append(emitExpr(forStmt.getUpdate().get(i)));
            }

            line(sb, "for (" + init + "; " + cond + "; " + update + ") {");
            indent++;
            emitBlockBody(forStmt.getBody(), sb);
            indent--;
            line(sb, "}");
        }

        private void emitForEach(ForEachStmt forEach, StringBuilder sb) {
            String varName = forEach.getVariableDeclarator().getNameAsString();
            line(sb, "for (let " + varName + " of " + emitExpr(forEach.getIterable()) + ") {");
            indent++;
            emitBlockBody(forEach.getBody(), sb);
            indent--;
            line(sb, "}");
        }

        private void emitSwitch(SwitchStmt switchStmt, StringBuilder sb) {
            line(sb, "switch (" + emitExpr(switchStmt.getSelector()) + ") {");
            indent++;
            for (var entry : switchStmt.getEntries()) {
                if (entry.getLabels().isEmpty()) {
                    line(sb, "default:");
                } else {
                    for (var label : entry.getLabels()) {
                        line(sb, "case " + emitExpr(label) + ":");
                    }
                }
                indent++;
                for (var s : entry.getStatements()) {
                    emitStatement(s, sb);
                }
                indent--;
            }
            indent--;
            line(sb, "}");
        }

        private void emitTry(TryStmt tryStmt, StringBuilder sb) {
            line(sb, "try {");
            indent++;
            for (var s : tryStmt.getTryBlock().getStatements()) {
                emitStatement(s, sb);
            }
            indent--;
            for (var catchClause : tryStmt.getCatchClauses()) {
                line(sb, "} catch (" + catchClause.getParameter().getNameAsString() + ") {");
                indent++;
                for (var s : catchClause.getBody().getStatements()) {
                    emitStatement(s, sb);
                }
                indent--;
            }
            if (tryStmt.getFinallyBlock().isPresent()) {
                line(sb, "} finally {");
                indent++;
                for (var s : tryStmt.getFinallyBlock().get().getStatements()) {
                    emitStatement(s, sb);
                }
                indent--;
            }
            line(sb, "}");
        }

        private void emitBlockBody(Statement body, StringBuilder sb) {
            if (body instanceof BlockStmt block) {
                for (var s : block.getStatements()) {
                    emitStatement(s, sb);
                }
            } else {
                emitStatement(body, sb);
            }
        }

        // ── Expression emission ──

        private String emitExpr(Expression expr) {
            if (expr instanceof VariableDeclarationExpr varDecl) {
                StringBuilder sb = new StringBuilder("let ");
                for (int i = 0; i < varDecl.getVariables().size(); i++) {
                    if (i > 0) sb.append(", ");
                    var v = varDecl.getVariables().get(i);
                    sb.append(v.getNameAsString());
                    if (v.getInitializer().isPresent()) {
                        sb.append(" = ").append(emitExpr(v.getInitializer().get()));
                    }
                }
                return sb.toString();

            } else if (expr instanceof AssignExpr assign) {
                return emitExpr(assign.getTarget()) + " " + assign.getOperator().asString() + " " + emitExpr(assign.getValue());

            } else if (expr instanceof MethodCallExpr call) {
                return emitMethodCall(call);

            } else if (expr instanceof ObjectCreationExpr create) {
                return emitObjectCreation(create);

            } else if (expr instanceof FieldAccessExpr field) {
                return emitFieldAccess(field);

            } else if (expr instanceof NameExpr name) {
                return name.getNameAsString();

            } else if (expr instanceof ThisExpr) {
                return "this";

            } else if (expr instanceof SuperExpr) {
                return "super";

            } else if (expr instanceof BinaryExpr bin) {
                return emitExpr(bin.getLeft()) + " " + bin.getOperator().asString() + " " + emitExpr(bin.getRight());

            } else if (expr instanceof UnaryExpr unary) {
                if (unary.isPostfix()) {
                    return emitExpr(unary.getExpression()) + unary.getOperator().asString();
                } else {
                    return unary.getOperator().asString() + emitExpr(unary.getExpression());
                }

            } else if (expr instanceof ConditionalExpr cond) {
                return emitExpr(cond.getCondition()) + " ? " + emitExpr(cond.getThenExpr()) + " : " + emitExpr(cond.getElseExpr());

            } else if (expr instanceof EnclosedExpr enclosed) {
                return "(" + emitExpr(enclosed.getInner()) + ")";

            } else if (expr instanceof CastExpr cast) {
                // Strip the cast, just emit the expression
                return emitExpr(cast.getExpression());

            } else if (expr instanceof ArrayCreationExpr array) {
                if (array.getInitializer().isPresent()) {
                    return emitArrayInit(array.getInitializer().get());
                }
                // new Type[n] → new Array(n).fill(null)
                if (!array.getLevels().isEmpty() && array.getLevels().get(0).getDimension().isPresent()) {
                    return "new Array(" + emitExpr(array.getLevels().get(0).getDimension().get()) + ").fill(null)";
                }
                return "[]";

            } else if (expr instanceof ArrayInitializerExpr arrayInit) {
                return emitArrayInit(arrayInit);

            } else if (expr instanceof ArrayAccessExpr access) {
                return emitExpr(access.getName()) + "[" + emitExpr(access.getIndex()) + "]";

            } else if (expr instanceof ClassExpr) {
                // Type.class → Type (for hardwareMap.get)
                return expr.asClassExpr().getType().asString();

            } else if (expr instanceof InstanceOfExpr instanceOf) {
                return emitExpr(instanceOf.getExpression()) + " instanceof " + instanceOf.getType().asString();

            } else if (expr instanceof LambdaExpr lambda) {
                return emitLambda(lambda);

            } else if (expr instanceof StringLiteralExpr str) {
                return "\"" + str.getValue() + "\"";

            } else if (expr instanceof IntegerLiteralExpr || expr instanceof DoubleLiteralExpr ||
                       expr instanceof LongLiteralExpr || expr instanceof BooleanLiteralExpr) {
                String val = expr.toString();
                // Strip Java suffixes: 0.5f → 0.5, 100L → 100
                val = val.replaceAll("[fFdDlL]$", "");
                return val;

            } else if (expr instanceof CharLiteralExpr charLit) {
                return "'" + charLit.getValue() + "'";

            } else if (expr instanceof NullLiteralExpr) {
                return "null";

            } else if (expr instanceof MethodReferenceExpr methodRef) {
                // Class::method → (args) => Class.method(args) — simplified
                return "(...args) => " + emitExpr(methodRef.getScope()) + "." + methodRef.getIdentifier() + "(...args)";

            } else {
                // Fallback
                return expr.toString();
            }
        }

        private String emitMethodCall(MethodCallExpr call) {
            String name = call.getNameAsString();
            String scope = call.getScope().map(this::emitExpr).orElse(null);
            String args = emitArgs(call.getArguments());

            // Special transformations
            // .equals() → ===
            if ("equals".equals(name) && call.getArguments().size() == 1) {
                return (scope != null ? scope : "this") + " === " + emitExpr(call.getArgument(0));
            }

            // .size() → .length
            if ("size".equals(name) && call.getArguments().isEmpty() && scope != null) {
                return scope + ".length";
            }

            // System.out.println → console.log
            if (scope != null && scope.equals("System.out") &&
                ("println".equals(name) || "print".equals(name) || "printf".equals(name))) {
                return "console.log(" + args + ")";
            }

            // System.nanoTime() → performance.now() * 1e6
            if ("nanoTime".equals(name) && scope != null && scope.equals("System")) {
                return "(performance.now() * 1e6)";
            }
            if ("currentTimeMillis".equals(name) && scope != null && scope.equals("System")) {
                return "performance.now()";
            }

            // hardwareMap.dcMotor.get → hardwareMap.get(DcMotor, ...)
            if ("get".equals(name) && scope != null) {
                if (scope.equals("hardwareMap.dcMotor") || scope.equals("this.hardwareMap.dcMotor")) {
                    return "hardwareMap.get(DcMotor, " + args + ")";
                }
                if (scope.equals("hardwareMap.servo") || scope.equals("this.hardwareMap.servo")) {
                    return "hardwareMap.get(Servo, " + args + ")";
                }
                if (scope.equals("hardwareMap.crservo") || scope.equals("this.hardwareMap.crservo")) {
                    return "hardwareMap.get(CRServo, " + args + ")";
                }
                if (scope.equals("hardwareMap.colorSensor") || scope.equals("this.hardwareMap.colorSensor")) {
                    return "hardwareMap.get(ColorSensor, " + args + ")";
                }
                if (scope.equals("hardwareMap.imu") || scope.equals("this.hardwareMap.imu")) {
                    return "hardwareMap.get(IMU, " + args + ")";
                }
            }

            // Thread.sleep → await this.sleep (in linear opmodes)
            if ("sleep".equals(name)) {
                if ((scope != null && scope.equals("Thread")) ||
                    scope == null || (scope != null && scope.equals("this"))) {
                    if ("linearopmode".equals(opModeType) || "commandopmode".equals(opModeType)) {
                        return "await this.sleep(" + args + ")";
                    }
                }
            }

            // waitForStart() → await this.waitForStart()
            if ("waitForStart".equals(name) &&
                ("linearopmode".equals(opModeType) || "commandopmode".equals(opModeType))) {
                return "await this.waitForStart()";
            }

            // idle() → await this.idle()
            if ("idle".equals(name) && call.getArguments().isEmpty() &&
                ("linearopmode".equals(opModeType) || "commandopmode".equals(opModeType))) {
                return "await this.idle()";
            }

            // Build the call
            if (scope != null) {
                return scope + "." + name + "(" + args + ")";
            }
            return name + "(" + args + ")";
        }

        private String emitObjectCreation(ObjectCreationExpr create) {
            String typeName = create.getType().getNameAsString();

            // ArrayList → []
            if (typeName.endsWith("List") || typeName.equals("ArrayList") || typeName.equals("LinkedList")) {
                if (create.getArguments().isEmpty()) return "[]";
            }
            // HashMap → {}
            if (typeName.endsWith("Map") || typeName.equals("HashMap") ||
                typeName.equals("LinkedHashMap") || typeName.equals("TreeMap")) {
                if (create.getArguments().isEmpty()) return "{}";
            }
            // HashSet → new Set()
            if (typeName.endsWith("Set") || typeName.equals("HashSet") || typeName.equals("TreeSet")) {
                if (create.getArguments().isEmpty()) return "new Set()";
            }

            String args = emitArgs(create.getArguments());

            // Anonymous inner class
            if (create.getAnonymousClassBody().isPresent()) {
                StringBuilder sb = new StringBuilder();
                sb.append("new (class extends ").append(typeName).append(" {\n");
                indent++;
                for (var member : create.getAnonymousClassBody().get()) {
                    if (member instanceof MethodDeclaration method) {
                        emitMethod(method, sb);
                    }
                }
                indent--;
                indent(sb);
                sb.append("})(").append(args).append(")");
                return sb.toString();
            }

            return "new " + typeName + "(" + args + ")";
        }

        private String emitFieldAccess(FieldAccessExpr field) {
            String scope = emitExpr(field.getScope());
            String name = field.getNameAsString();

            // Type.class → Type
            if ("class".equals(name)) {
                return scope;
            }

            return scope + "." + name;
        }

        private String emitLambda(LambdaExpr lambda) {
            StringBuilder sb = new StringBuilder();
            sb.append("(");
            var params = lambda.getParameters();
            for (int i = 0; i < params.size(); i++) {
                if (i > 0) sb.append(", ");
                sb.append(params.get(i).getNameAsString());
            }
            sb.append(") => ");

            if (lambda.getBody() instanceof ExpressionStmt exprStmt) {
                sb.append(emitExpr(exprStmt.getExpression()));
            } else if (lambda.getBody() instanceof BlockStmt block) {
                sb.append("{\n");
                indent++;
                for (var s : block.getStatements()) {
                    emitStatement(s, sb);
                }
                indent--;
                indent(sb);
                sb.append("}");
            } else {
                sb.append(lambda.getBody().toString());
            }

            return sb.toString();
        }

        private String emitArrayInit(ArrayInitializerExpr arrayInit) {
            StringBuilder sb = new StringBuilder("[");
            var values = arrayInit.getValues();
            for (int i = 0; i < values.size(); i++) {
                if (i > 0) sb.append(", ");
                sb.append(emitExpr(values.get(i)));
            }
            sb.append("]");
            return sb.toString();
        }

        private String emitParams(NodeList<Parameter> params) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < params.size(); i++) {
                if (i > 0) sb.append(", ");
                sb.append(params.get(i).getNameAsString());
            }
            return sb.toString();
        }

        private String emitArgs(NodeList<Expression> args) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < args.size(); i++) {
                if (i > 0) sb.append(", ");
                sb.append(emitExpr(args.get(i)));
            }
            return sb.toString();
        }

        private void line(StringBuilder sb, String text) {
            indent(sb);
            sb.append(text).append("\n");
        }

        private void indent(StringBuilder sb) {
            sb.append("  ".repeat(indent));
        }
    }

    public record TranspileResult(
        String code,
        String className,
        String opModeType,
        Map<String, String> annotations
    ) {}
}
