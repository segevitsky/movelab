# MediaPipe Tasks reads its protobuf-lite messages by reflection (field names like platform_) and loads
# calculators by class name; R8 renamed them in the first release build (2026-11-17: "Field platform_ for
# ou2 not found" on both delegates). Keep MediaPipe, protobuf and ONNX Runtime untouched.
-keep class com.google.mediapipe.** { *; }
-keep class com.google.protobuf.** { *; }
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite { <fields>; }
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite$Builder { <fields>; }
-keep class ai.onnxruntime.** { *; }
-keep class expo.modules.pose.** { *; }
-dontwarn com.google.mediapipe.**
-dontwarn ai.onnxruntime.**
-dontwarn com.google.protobuf.**
# MediaPipe's Flogger-based logging finds its caller by walking the stack (Graph.<clinit> →
# "no caller found on the stack for: gd1" once R8 renamed the frames)
-keep class com.google.common.flogger.** { *; }
-keep class com.google.common.** { *; }
-dontwarn com.google.common.**
