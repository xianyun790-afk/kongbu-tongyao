# 恐怖童谣 · 公共 AI DM 后端

部署步骤、联网要求、HTTPS、GitHub Actions 变量与验收见 [语音部署说明](../docs/语音部署说明.md)。

Node.js 24，`npm ci --ignore-scripts`，从 `.env.example` 复制 `.env.local` 并在服务器填写，然后 `npm test`、`npm start`。

此目录只包含公共材料与 DM 服务，无密钥、私人角色本或 Blender 文件。Dockerfile 和 nginx 配置为部署模板，尚未在公网运行。请将父目录的语音部署说明与本目录一并交付。
