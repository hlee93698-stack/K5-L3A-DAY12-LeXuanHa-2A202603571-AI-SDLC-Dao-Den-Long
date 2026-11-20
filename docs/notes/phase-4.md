# Phase 4: Ticket-04 "Bình minh: phát hành v1.0.0" (Contract v1.3)

## ADR-004: Bench, Soak, Leaderboard, Accessibility

**Bối cảnh.** Phase 4 chuyển game từ "chạy được" thành "phát hành được": đo hiệu năng có số đo cụ thể, ổn định khi chạy lâu, bảng xếp hạng cục bộ, và dễ tiếp cận.

**Quyết định chính:**

1. **Bench_cmd = `node scripts/bench.mjs`**: puppeteer-core (đã có) mở Chrome headless, điều hướng đến `?bench=1&seed=42&duration=30`. Web app chạy cảnh bench (không phải headless) để đo render thực. Output: `bench.json` chuẩn v1.3. Không dùng `dist/headless.cjs` cho bench vì benchmark đo GPU rendering, không đo sim speed.

2. **Soak_cmd tích hợp vào `dist/headless.cjs --soak`**: chạy thuần Node.js, không cần browser. Lặp 10 đêm trong cùng tiến trình; đo RSS trước và sau để phát hiện rò rỉ bộ nhớ.

3. **Leaderboard lưu hai lớp**: server lưu `data/leaderboard.json` qua `/api/leaderboard` (khi chạy `npm start`); web fall back sang localStorage nếu fetch lỗi (ví dụ mở file:// trực tiếp). Export: `npm start -- --export-leaderboard out.json`.

4. **Accessibility**: phím tùy chỉnh dùng event-listener động (không hard-code keyCode); lưu vào localStorage riêng (`ddl-bindings`); kiểm tra trùng phím trước khi lưu. Chế độ giảm chuyển động tắt flash màn hình và rung camera. Font tối thiểu 18 px; tùy chọn ×1.25.

## Giả định (chỗ ticket chưa nói rõ)

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| D1 | "rải đều trên đảo (seed 42)" cho 200 Bóng Mực bench | Phân phối đều theo góc + bán kính ngẫu nhiên trong r ≤ 38 m dùng mulberry32(42). Visual-only (không qua sim), dùng wander tốc độ 2 m/s, đổi mục tiêu mỗi 2 s |
| D2 | "CCW khi nhìn từ trên xuống" | Three.js Y-up: θ tăng → pos = (30·cosθ, 15, 30·sinθ), xuất phát θ=0 tại (30,15,0) |
| D3 | `load_ms` "từ lúc tiến trình bắt đầu" | Date.now() ở đầu bench.mjs (trước khi mở browser) → thời điểm frame bench đầu tiên được vẽ (window.__benchReady) |
| D4 | `peak_mem_mb` trong browser | Đỉnh `performance.memory.usedJSHeapSize` (JS heap của trang), lấy mẫu 1 lần/giây NGAY TRONG trang. Không phải RSS của tiến trình Chrome. _(Đã đổi khi làm: ban đầu dùng `page.metrics()` qua CDP nhưng mỗi lần gọi làm khựng khung hình, kéo tụt 1% low.)_ |
| D5 | vsync_off | Chrome headless không có display, rAF không bị giới hạn bởi màn hình → ghi `vsync_off: true` |
| D6 | mem_start vs mem_end trong soak | mem_start = RSS sau khi kết thúc đêm 1; mem_end = RSS sau khi kết thúc đêm cuối cùng |
| D7 | Input ngẫu nhiên soak | Đêm i (0-based) là Đêm `(i mod 3) + 1`, seed `seed + i`; input từ mulberry32(seed ^ 0xdeadbeef); mỗi 30 tick đổi hướng; mỗi tick: 5% nhảy, 3% lướt, 2% tỏa sáng, 10% tương tác. Chạy tới khi hết Đêm (thắng/thua) hoặc quá thời lượng + 10 s. Input ngẫu nhiên gần như luôn thua sớm (rơi khỏi đảo / bị Bóng Mực chạm): soak đo độ ổn định và rò rỉ bộ nhớ, không đo khả năng thắng |
| D8 | "phát hiện trùng phím" | Nếu gán phím K cho B trong khi A đang dùng K: **đổi chỗ** (A nhận phím cũ của B) và hiện cảnh báo "Phím K đang dùng cho [A]. Đã đổi chỗ…". _(Đã đổi khi làm: ban đầu ghi đè, nhưng như vậy hai hành động dùng chung một phím.)_ |
| D9 | Leaderboard khi thua ở bất kỳ Đêm nào | Hiển thị form nhập tên SAU màn hình result (thua) và SAU màn hình dawn (thắng Đêm 3). Không hiển thị khi thắng Đêm 1 hoặc 2 (game tiếp tục) |
| D10 | Seed trong leaderboard entry | Seed là seed của Sim game (Date.now() >>> 0 % 1000000, giống logic hiện tại) |
| D11 | "Bóng Mực xuất hiện" indicator | Khi nhận event `shade_spawned`, flash mũi tên đỏ ở cạnh màn hình chỉ về phía shade đó trong 2 giây |
| D12 | bench.mjs viết bench.json ở đâu | Viết vào đường dẫn `--out` (mặc định `bench.json` tại thư mục hiện tại). Bằng chứng commit ở `docs/proof/phase-4/bench.json` (sinh bằng lệnh, không sửa tay) |
| D13 | Font tối thiểu 18 px | Áp cho chữ nội dung: thẻ menu/cài đặt/bảng xếp hạng, gợi ý, Bùa Gió, HUD góc phải. Ngoại lệ: nhãn nhỏ dưới icon hồi chiêu (Lướt/Tỏa Sáng) và bộ đếm FPS (công cụ debug). "Chữ lớn" phóng ×1.25 toàn bộ thẻ và HUD |
| D14 | Leaderboard: điểm khi thua | Điểm lưu = tổng điểm các Đêm đã thắng + điểm của Đêm đang thua; `nights_won` = số Đêm đã thắng. Tên: 3–12 ký tự `A-Z a-z 0-9 _`. Top 10, cùng điểm thì ai đạt trước xếp trên |

## Tiêu chí nghiệm thu

| Mục | Tiêu chí | Kiểm chứng |
|---|---|---|
| Bench | Chạy được `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json`; thoát 0; file hợp lệ | Manual + CI |
| Bench ngưỡng | avg_fps ≥ 60, p1_low_fps ≥ 30, load_ms ≤ 10000 (trên máy TA) | bench.json |
| Soak | 10 đêm, crashes = 0, mem_end ≤ 1.2 × mem_start | soak.json |
| Leaderboard | Nhập tên sau thua/dawn, hiện bảng từ menu, top 10 đúng thứ tự, persist sau reload | Manual |
| Export | `npm start -- --export-leaderboard out.json` ra file {"entries":[...]} | Manual |
| Phím tùy chỉnh | Đổi phím, cảnh báo trùng, Khôi phục mặc định, lưu qua reload | Manual |
| Giảm chuyển động | Tắt flash + rung camera | Manual (đọc code) |
| Font | ≥ 18px mặc định, ×1.25 khi bật | CSS |
| Regress | 79 test + 42 scenario vẫn pass | npm test |

## Kết quả đo (2026-11-20, laptop i5-1135G7 + Iris Xe, Windows 11, cắm sạc)

| Mục | Kết quả | Ngưỡng | Bằng chứng |
|---|---|---|---|
| Bench 30 s, seed 42, 1280×720 | avg **115.4** FPS, 1% low **65.1**, p95 11.8 ms, load **1158** ms, heap 15.4 MB | ≥ 60 / ≥ 30 / ≤ 10000 ms | [bench.json](../proof/phase-4/bench.json) |
| Soak 10 Đêm, seed 7 | 0 crash, RSS 44.7 → 46.3 MB (+3.6%) | 0 crash, ≤ +20% | [soak.json](../proof/phase-4/soak.json) |
| Regress | 80 test (79 cũ + soak) + 42 scenario đạt | tất cả đạt | `npm test`, [phase-3 report](../proof/phase-3/report.md) |

Ghi chú đo:
- Trước khi tối ưu, bench đạt avg ~60 FPS, 1% low ~19–28. Hai nguyên nhân: (1) mỗi Bóng Mực là 7 mesh có geometry riêng → ~1.400 draw call với 200 con; gộp còn 3 mesh dùng chung geometry; (2) bench.mjs poll trang qua CDP làm khựng khung hình; chuyển sang chờ trong trang.
- Lỗi tự phát hiện: p95 ban đầu tính trên mảng đã sắp **giảm dần** nên thực chất là p5 (ra 0.4 ms, vô lý). Đã sửa.
- Lần chạy đầu sau khi build thường thấp hơn hẳn (một lần ra 38 FPS) do máy chưa "nóng"; các lần sau ổn định 103–115 FPS.
- Thử bỏ `preserveDrawingBuffer` để tăng FPS: ảnh chụp headless bị trống → giữ nguyên; bench đo đúng cấu hình người chơi dùng.

## Test bị ảnh hưởng bởi v1.3

| Test | Lý do |
|---|---|
| `contract v1.2` → `contract v1.3` | contract_version đổi sang "1.3" |
| `game.contract.json tuning` | Thêm bench_cmd, soak_cmd vào file và test kiểm tra hai lệnh này; test tuning không đổi |
| Mới: `soak_cmd (Ticket-04)` trong `tests/cli.test.ts` | Chạy `soak_cmd` 3 Đêm: thoát 0, đúng 5 khóa, 0 crash, mem_end ≤ 1.2 × mem_start |
| Không spec headless nào đổi | Phase 4 không đổi luật mô phỏng; output headless giữ nguyên (verify sinh lại không có khác biệt) |
