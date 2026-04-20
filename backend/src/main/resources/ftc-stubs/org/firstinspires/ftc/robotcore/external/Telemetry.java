package org.firstinspires.ftc.robotcore.external;

public interface Telemetry {
    Item addData(String caption, Object value);
    Item addData(String caption, String format, Object... args);
    boolean removeItem(Item item);
    void addLine(String lineCaption);
    void clear();
    void clearAll();
    boolean update();
    void setAutoClear(boolean autoClear);

    interface Item {
        Item setCaption(String caption);
        Item setValue(Object value);
        Item setRetained(boolean retained);
    }
}
