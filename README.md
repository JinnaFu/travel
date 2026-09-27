# 广西国庆七天轻松自驾

本分支：`guangxi-national-day-2026`。`main` 保留原来的青甘路线；广西版使用独立的 `index.html`，不在青甘页面增加入口或混入广西行程。

2026 年 10 月 1–7 日，情侣两人从深圳出发，自有车辆往返：深圳 → 玉林 → 大新 → 德天瀑布 → 靖西（连住两晚、通灵大峡谷）→ 鹅泉 → 南宁 → 梧州 → 深圳。每天最多一个核心景点，住宿优先连锁酒店，费用默认不设预算上限。

[完整行程、酒店候选与核验来源](docs/guangxi-2026-national-day.md)

## 与青甘版相同的功能

- 每日行程编辑、时间轮盘、节点新增 / 排序 / 删除、按天筛选、查看当天。
- 互动地图、按天看路线、高德导航入口；酒店和景区先在高德确认准确位置，再开始驾车导航。配置可选的高德 Web 服务 Key 后可解析驾车终点。
- 每日相册、风景备注分组、美食餐次分组、宫格、长按拖动排序、大图查看、照片备注与删除、相册备份导入导出。
- 每天与照片的评论、昵称 / 颜色、未读提示、云端实时评论。
- 交通、住宿、待办、费用计算、自定义费用、预算余额、三档字号、分享、行程修改导入导出。
- Supabase 登录 / 注册、自动同步、手动读取、本机数据迁移、私有云相册、完整备份。

## 运行与发布

这是静态页面，不需要构建。切到本分支后，通过本地静态服务器打开 `index.html`；地图及云功能需要联网。

手机直接打开：[广西行程网页](https://jinnafu.github.io/travel/guangxi/)；原来的[青甘行程网页](https://jinnafu.github.io/travel/)保留原地址。GitHub 的分支链接展示源码，不能直接作为行程网页使用。

源码继续分别放在 `main`（青甘）与 `guangxi-national-day-2026`（广西）。`gh-pages` 只存放发布副本：根目录是青甘，`guangxi/` 是广西；GitHub Pages 的发布源为 `gh-pages` 的根目录。两版不互相合并，浏览器数据也分别保存。

后续源码更新后，需要重新发布，源码分支的推送不会自动更新线上页面。首次准备发布工作区：

```sh
git worktree add ../travel-pages gh-pages
```

在广西源码分支提交并推送修改后，执行：

```sh
git fetch origin
node scripts/build-pages.mjs ../travel-pages
git -C ../travel-pages add .
git -C ../travel-pages commit -m "Publish travel pages"
git -C ../travel-pages push origin gh-pages
```

已经存在发布工作区时跳过 `worktree add`。构建脚本会核对分支、干净工作区和已推送状态，保持青甘首页与 `main` 中的文件一致；`publication.json` 记录两版源码提交。分享按钮使用当前网页地址。

## 云同步初始化

1. 在 Supabase 项目的 SQL Editor 中运行 [supabase/guangxi.sql](supabase/guangxi.sql)。可以沿用原 Supabase 项目及账号，广西数据使用独立表和私有 bucket。
2. 打开页面“同步设置”，填写该项目的 Project URL 和 Publishable / anon key。不要使用 service_role key。
3. 两台手机用同一个旅行邮箱账号登录。首次使用可以注册，并按项目要求完成邮箱确认；在第一台手机点击“上传本机现有数据和照片到云端”。
4. 第二台手机登录后读取云端。行程修改自动上传；原版的一小时自动读取节奏、手动同步和评论实时提示均保留。

未提供远程 Supabase 配置，因此此分支没有代执行初始化或进行真实账号联机测试。未配置时，本机编辑、照片、评论、费用与备份仍可使用。

验证：Chrome 中检查了全部八个栏目、320 / 390 / 1440 像素布局、时间与行程编辑、照片压缩和排序、行程及相册备份恢复、评论与未读提示、费用和本机持久化。地图使用真实 Leaflet 验证七天筛选及道路服务失败时的回退；云数据表、相册 bucket 与实时订阅通过模拟客户端检查了隔离范围。

## 两条路线的数据隔离

| 数据 | 广西版 | 青甘版 |
| --- | --- | --- |
| 本机设置 / 行程 / 费用 / 评论 | `guangxi_2026_*` | 保留原 `qinggan_*` |
| IndexedDB 相册 | `guangxi_2026_trip_photos_v1` | 保留原数据库 |
| 登录会话 | `guangxi_2026_supabase_auth_v1` | 保留原会话键 |
| 行程 / 相册 / 评论表 | `guangxi_trip_state` / `guangxi_trip_photos` / `guangxi_trip_comments` | 保留原 `trip_*` |
| 私有相册 bucket | `guangxi-trip-photos` | 保留原 `trip-photos` |

备份文件类型也按路线区分，广西页不接受青甘版的行程或相册备份。SQL 只操作广西专用对象；行级权限按登录账号限制访问，私有照片按账号目录限制读写。

初始化方式参考 [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) 与 [Storage 访问控制](https://supabase.com/docs/guides/storage/security/access-control)。地图点用于全程走向示意，不作为酒店或停车入口精确坐标；参考点来源：[玉林](https://mapcarta.com/Yulin_%28Guangxi%29)、[靖西](https://mapcarta.com/Jingxi)、[德天中国一侧](https://mapcarta.com/Detian)、[通灵](https://mapcarta.com/N8251029617)、[鹅泉附近](https://www.fallingrain.com/world/CH/16/Equan.html)、[龙圩](https://mapcarta.com/N4950956079)。
