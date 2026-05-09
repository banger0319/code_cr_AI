# Flutter / Dart 规则

- 检查 `setState` 是否在组件销毁后调用，关注异步回调中的 `mounted` 判断。
- 检查 Widget build 中是否存在昂贵同步计算、重复创建 controller 或 stream subscription。
- 检查 `TextEditingController`、`AnimationController`、`StreamSubscription` 等资源是否释放。
- 检查空安全、异常处理、网络请求超时、状态管理边界是否合理。
- UI 变更需关注不同屏幕尺寸、暗色模式、无障碍语义和本地化文本。
