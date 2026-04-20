package com.qualcomm.robotcore.eventloop.opmode;

import java.lang.annotation.*;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface TeleOp {
    String name() default "";
    String group() default "";
}
