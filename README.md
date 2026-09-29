# 广东国庆五天轻松自驾

2026 年 10 月 1—5 日，情侣两人，深圳 → 珠海御温泉 → 顺德 → 广州增城白江湖 → 惠州小径湾 → 深圳。五天四晚，风景优先，连锁酒店为主，不设预算上限。白水寨替换方案和小径湾加住一晚的六天选项放在「提醒」中，默认日历保持五天。

- 手机直接打开：[广东行程网页](https://jinnafu.github.io/travel/guangdong/)
- 独立源码分支：`guangdong-national-day-2026`
- [完整行程、酒店候选与来源](docs/guangdong-2026-national-day.md)

GitHub 仓库和分支页面用于查看源码。查看旅行界面请使用上面的网页链接。

## 功能

沿用现有网站的八个栏目：每日行程、地图、相册、交通、住宿、待办、费用、提醒。保留时间轮盘、行程编辑与节点排序、按天筛选、高德导航、美景 / 美食相册、照片备注和排序、每日 / 照片评论、未读提示、费用计算、自定义项目、字号、分享、导入导出和云同步设置。

地图组件随网站发布并按需加载，外部地图服务不可用不会阻塞行程。费用初始为零；御温泉套餐整笔计入住宿，已包含的温泉、庙会与早餐不重复记账。

## 独立数据

| 数据 | 广东版 |
| --- | --- |
| 本机设置、行程、费用、评论 | `guangdong_2026_*` |
| IndexedDB 相册 | `guangdong_2026_trip_photos_v1` |
| 登录会话 | `guangdong_2026_supabase_auth_v1` |
| 云数据表 | `guangdong_trip_state`、`guangdong_trip_photos`、`guangdong_trip_comments` |
| 私有相册 bucket | `guangdong-trip-photos` |

备份类型也使用广东专属前缀，拒绝导入其他路线备份。青甘、广西的源码、网页和存储保留各自独立范围。

## 云同步

本机编辑、记账、照片、评论与备份可直接使用。两台手机共享数据需要先在自己的 Supabase 项目运行 [初始化 SQL](supabase/guangdong.sql)，再在网页「同步设置」填写 Project URL 和 Publishable / anon key，并登录同一旅行账号。不要使用 service_role key。SQL 只创建广东专用对象，按登录账号启用行级访问限制和私有照片目录权限。

本次未提供远程 Supabase 配置，未执行远程初始化；云表、bucket、实时订阅通过模拟客户端验证隔离范围，未进行真实账号联网验证。

## 发布三个独立网址

| 源码分支 | 发布网址 |
| --- | --- |
| `main`（青甘） | https://jinnafu.github.io/travel/ |
| `guangxi-national-day-2026`（广西） | https://jinnafu.github.io/travel/guangxi/ |
| `guangdong-national-day-2026`（广东） | https://jinnafu.github.io/travel/guangdong/ |

GitHub Pages 从 `gh-pages` 根目录发布。`gh-pages` 仅存放发布副本；源码分支互不合并。以后发布请使用本分支的三路线构建脚本，它会按各自远程分支读取文件并记录三个来源提交。

提交并推送广东源码后，在本分支运行（发布工作区须事先通过 `git worktree add ../travel-pages gh-pages` 创建）：

```sh
git fetch origin
node scripts/build-pages.mjs ../travel-pages
git -C ../travel-pages add .
git -C ../travel-pages commit -m "Publish Guangdong itinerary"
git push origin gh-pages
```

构建要求源码与发布工作区干净、广东源码已推送，并核实 `gh-pages` 与远程同步。已有青甘、广西 HTML 和地图资源从对应分支逐字节读取，广东发布在独立子目录。

## 验证

`node tests/map-loading.mjs` 验证手机页面不被地图加载失败或超时阻塞、重试后五天路线可用。需要本机 Chrome，可用 `CHROME_PATH` 指定可执行文件。

`node tests/guangdong-features.mjs` 验证五天四晚数据、八个栏目、编辑 / 时间轮盘、导航、地图筛选、相册 / 评论、记账、备份与跨路线隔离，以及 320 / 390 / 1440 像素布局。该测试使用临时浏览器资料目录，不接触个人浏览器数据。
