# Flutter 审查规则

- 检查 Widget 布局约束是否正确。当发现 Column/Row/Flex 中直接嵌套 ListView、GridView、TextField 等需要约束的 Widget 时，**必须调用 Available Skills 中的 `flutter-fix-layout-issues`** 来诊断和修复布局问题。
- 检查 "RenderFlex overflowed"、"unbounded height/width"、"Incorrect use of ParentData widget" 等布局错误 — 这些问题 **必须参考 `flutter-fix-layout-issues` skill** 中的诊断流程和修复示例。
- 检查 Expanded/Flexible 是否作为 Row/Column/Flex 的直接子节点，Positioned 是否作为 Stack 的直接子节点。如发现违规，使用 `flutter-fix-layout-issues` skill 中的修复模式。
- 检查 Widget build 方法是否有不必要的重建（const 构造函数、RepaintBoundary）。
- 检查异步操作是否有 loading/error/empty 状态处理。
- 检查 dispose 中是否正确释放了 AnimationController、TextEditingController、FocusNode、StreamSubscription 等资源。
- 检查是否有硬编码字符串，建议提取到 i18n 文件。
- 检查 Navigator push/pop 是否有异常处理。
