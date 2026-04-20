package com.qualcomm.robotcore.eventloop.opmode;

import java.lang.annotation.*;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface Autonomous {
    String name() default "";
    String group() default "";
    boolean preselectTeleOp() default false;
}
