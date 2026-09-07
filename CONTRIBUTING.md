# 参与开发

## 本地

```sh
pnpm install
pnpm verify      # typecheck + smoke
pnpm build
```

## 为什么 `lib/` 在版本库里

这个插件走 GitHub 分发。`dsh plugin add github:<owner>/<repo>` 拿到的是**源码**，
不是构建产物；要让它可用，只有两条路：

1. 提供 `prepare` 脚本 —— pnpm ≥10 默认拦截 Git 依赖的构建脚本，用户得先在 profile 的
   `pnpm-workspace.yaml` 里写 `allowBuilds` 再重装。多一步，而且那一步是在**执行第三方代码**。
2. 把构建产物提交进 Git —— 用户零摩擦，代价是维护者要记得重新构建。

选了第 2 条。**所以改完 `src/` 必须 `pnpm build` 并把 `lib/` 一起提交**，
否则用户装到的是旧代码，而这件事没有任何自动检查会拦住你。

## 自测为什么必须真的跑

`pnpm typecheck` 抓不到 value-schema DSL 的违规。最典型的是 `required: true` 出现在
`items:` 指向的节点根上或 `output.schema` 根节点上——tsc 一律放行，`defineTool` 在**运行时**
才抛 `UNSUPPORTED_SCHEMA`。`scripts/smoke.ts` 的第一项就是把所有工具真的构造一遍。
