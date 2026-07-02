# 毛概总题库刷题网站

这是一个 React + Vite + TypeScript + Tailwind CSS 制作的静态刷题网站。项目不包含后端、数据库、登录注册或后台管理，网站运行时只读取 `public/questions.json`。

用户的做题记录、错题本和练习进度只保存在各自浏览器的 `localStorage` 中，不会上传到服务器。

## 本地运行

```bash
npm install
npm run parse
npm run dev
```

启动后按终端显示的网址访问即可。

## 重新解析题库

原始题库文件放在：

```text
data/毛概总题库.docx
```

出于公开仓库部署考虑，`data/*.docx` 默认不会提交到 GitHub。重新解析题库时，请先在本地放好该文件。

重新生成题库数据：

```bash
npm run parse
```

解析结果会生成：

```text
public/questions.json
public/parse_errors.json
```

网站运行时只读取 `public/questions.json`。如果有题目无法完全自动识别，请检查 `public/parse_errors.json` 并人工修正源文件或生成后的 JSON。

## 生成静态部署文件

```bash
npm run build
```

构建完成后，`dist` 文件夹就是最终静态网站。把 `dist` 部署到线上，别人通过网址访问即可。

## 部署到 Vercel

1. 将项目推送到 GitHub、GitLab 或 Bitbucket。
2. 在 Vercel 新建项目并选择该仓库。
3. Build Command 填写：

```bash
npm run build
```

4. Output Directory 填写：

```text
dist
```

5. 部署前确认已经执行过 `npm run parse`，并提交了 `public/questions.json`。

## 部署到 Netlify

1. 将项目推送到代码仓库。
2. 在 Netlify 新建站点并选择该仓库。
3. Build command 填写：

```bash
npm run build
```

4. Publish directory 填写：

```text
dist
```

5. 部署前确认已经执行过 `npm run parse`，并提交了 `public/questions.json`。

## 部署到 GitHub Pages

1. 执行构建：

```bash
npm run build
```

2. 将 `dist` 文件夹内容发布到 GitHub Pages 使用的分支或目录。
3. 也可以使用 GitHub Actions 自动构建并发布 `dist`。

本项目的 Vite `base` 已设置为 `./`，适合部署到 GitHub Pages 的子路径。

## 静态网站说明

最终网站只依赖静态文件，不需要服务器程序。题库来自 `public/questions.json`，用户记录保存在访问者自己的浏览器 `localStorage` 中。换浏览器、清理浏览器数据或更换设备后，做题记录不会自动同步。
