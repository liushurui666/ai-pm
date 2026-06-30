import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      // Draco 解码器是 three 官方 examples 的预编译静态运行时文件，用于浏览器端恢复 Active Theory 镜像的 DRACO 几何。
      // 这类第三方压缩产物不能按项目源码规则 lint，否则会因 CommonJS/混淆变量触发误报。
      "public/landing/draco/**",
      "public/landing/basis/**",
    ]
  }
];

export default eslintConfig;
