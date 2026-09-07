import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  // package.json 的 main/exports 指向 lib/index.js，这里必须产出同名文件。
  // 默认是 .mjs —— 不改就是装上去找不到入口，而 typecheck 和自测都发现不了。
  outExtensions: () => ({ js: '.js' }),
  dts: false,                      // 声明由 tsc 单独产出到 lib/types
  clean: false,   // 由 build 脚本先清，避免洗掉 tsc 产出的 types/
  deps: { neverBundle: [/^@deepseek-ai\//] },
})
