# React + TypeScript + Vite

This template provides a minimal setup for React to work in Vite with HMR and some Oxlint rules.

## 脚本工具

### 汉字码空间数据（`scripts/gen-blocks.mjs`）

从 Unicode 官方 [Blocks.txt](https://www.unicode.org/Public/18.0.0/ucd/Blocks.txt) 生成 `src/data/blocks.json`：

```sh
node scripts/gen-blocks.mjs <Blocks.txt路径> src/data/blocks.json
```

### 汉字已分配码位参考标准（`scripts/gen-han-assigned.mjs`）

从 Unicode 官方 [Scripts.txt](https://www.unicode.org/Public/18.0.0/ucd/Scripts.txt) 生成 `src/data/han-assigned.json`（Script=Han 全部已分配码位，按官方区块分组）。覆盖度检测的分母以此为准，而非区块全长，避免把区块内部未分配的空隙误报为缺字；该文件同时是网页演示页浏览器端实时计算的参考标准：

```sh
node scripts/gen-han-assigned.mjs <Scripts.txt路径>
```

### 字体汉字覆盖度检测（`scripts/font-coverage.mjs`）

检测字体文件（ttf/otf/ttc/woff/woff2）的 Unicode 汉字覆盖度，输出控制台报告与 JSON 报告（默认写入 `reports/`，含每区块覆盖/缺失码位区间，可直接驱动全景热力图）。支持 ttc 逐成员分析、多字体对比：

```sh
pnpm coverage <字体文件...>              # 基本用法
pnpm coverage 字体A 字体B --strict       # 校验命中字形是否为空轮廓（注水检测）
pnpm coverage 字体A --missing            # 打印每区块完整缺失码位区间
pnpm coverage 字体A --out <目录> --no-json --reference <han-assigned.json>
```

口径：主覆盖率 = 13 个表意区块（统一表意 + 兼容表意）内已分配码位的覆盖比例；散居在部首/符号区块的 Han 码位（U+2E80/2F00 等）单独统计，不计入主覆盖率。

### 覆盖热力图演示页（`/coverage.html`）

独立多页入口（不依赖主页面）。**直接在页面上选择字体文件**（ttf/otf/ttc/woff/woff2，可多选），浏览器内用 fontkit 实时计算汉字覆盖度并渲染到码空间全景与区块详图——暗罩/斜纹 = 缺失码位，保持原色 = 已覆盖，悬停可查看区块级覆盖率。多选多款字体时按**字体栈语义取并集**：默认显示「合计」总体覆盖，队列中可切换/移除单字体查看各自覆盖，悬停卡片同时列出每款字体的覆盖率与合计。计算结果（含并集）可经「⬇ JSON」导出为 `.coverage.json` 数据模型文件，与 CLI 产物同构、可再次载入复现。也可载入 CLI 生成的 `.coverage.json`。本地计算，不上传任何数据。架构遵循 Model-View 分层：报告 JSON 是唯一数据模型（`src/coverage/lib/report.ts`），`lib/coverage.ts` 组装 ViewModel 驱动全景/详图/统计芯片等全部视图：

```sh
pnpm dev   # 打开 http://localhost:5173/coverage.html 选择字体文件即可
```

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.
You can also try [the experimental native React Compiler support in plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md#rust-react-compiler) by using `compiler: true` in the plugin options instead of using the Babel plugin.

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
