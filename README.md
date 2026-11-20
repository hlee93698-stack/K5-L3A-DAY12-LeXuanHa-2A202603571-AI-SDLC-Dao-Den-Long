# Đảo Đèn Lồng

> **Video demo:** _(sẽ thêm ở Phase 4: Release `v1.0.0`)_
> Bài lab Day 12 AI SDLC, cá nhân: Lê Xuân Hà, MSSV 2A202603571. Đề bài: [docs/lab/](docs/lab/README.md). Test Contract **v1.2**. Lịch sử thay đổi từng phiên bản: [CHANGELOG.md](CHANGELOG.md).

Game 3D góc nhìn thứ ba. **Mây**, người giữ đèn nhỏ tuổi đội nón lá, đi qua **3 Đêm** (Đảo Bến, Đảo Cau, Đảo Chuông) gom đom đóm để thắp lại các Đèn Lồng Lớn trước bình minh, đồng thời né **Bóng Mực** và **Gió Lạc**.

![Gameplay](docs/proof/phase-2/screenshots/night2-bridge-drifter.png)

## Cài đặt và chạy (3 lệnh)

Cần Node.js ≥ 18 (macOS, Linux hoặc Windows).

```bash
npm ci
npm run build
npm start          # mở http://localhost:5173 (hoặc mở thẳng dist/web/index.html)
```

## Điều khiển

| Phím | Hành động |
|---|---|
| `W A S D` / mũi tên lên-xuống | Đi theo hướng camera (điều khiển được cả trên không) |
| `Space` | Nhảy |
| `Shift` | Lướt: 14 m/s trong 0.2 s, hồi 1.5 s |
| `E` | Nạp ánh sáng vào đèn gần nhất (trong 2 m) |
| `F` | Tỏa Sáng: tốn 3 đom đóm, choáng Bóng Mực trong 5 m, hồi 3 s |
| Kéo chuột / `←` `→` | Xoay camera (độ nhạy chỉnh trong Cài đặt) |
| `Esc` / `P` | Tạm dừng: Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu |
| `Enter` | Chọn nút đang sáng trong menu |
| `F3` | Hiện FPS |

## Luật chơi (số chuẩn Ticket-02)

- **Đom đóm:** nhặt tự động (XZ ≤ 1 m, chênh cao ≤ 1.5 m), mang tối đa 10. Có 20 con lúc đầu, cứ 4 s sinh thêm 1 (trần 30).
- **Đèn lồng:** mỗi đèn cần 10 đom đóm, nạp nhiều lần được. Đèn đã sáng tạo **vùng an toàn 6 m**, Bóng Mực không vào được.
- **Bóng Mực:** xuất hiện từ giây thứ 5 (2 con), sau đó cứ 8 / 7 / 6 s thêm 1 con (Đêm 1 / 2 / 3). Thấy Mây trong 12 m thì đuổi, quá 18 m thì bỏ. Chạm vào: −1 Ngọn Lửa, rơi một nửa số đom đóm đang mang ra quanh Mây (nhặt lại được trong 8 s), bất tử 1.5 s.
- **Rơi khỏi đảo:** −1 Ngọn Lửa, mất hết đom đóm, hồi sinh ở điểm xuất phát sau 1 s.
- **Gió Lạc** (Đêm 2, 3): đuổi khi Mây mang ≥ 5 đom đóm, cướp 3 con rồi bỏ chạy. Tỏa Sáng trúng thì nó thả lại đồ đã cướp.
- **Bùa Gió** (Đêm 2, 3): 10 s chạy 7.2 m/s và lướt không hồi chiêu.
- **Đêm 3:** đảo 3 tầng (lên tầng 1 bằng dốc, lên tầng 2 bằng bục nhảy), có gió mạnh mỗi 30 s.
- Ngọn Lửa hồi đầy mỗi Đêm. Thắng: thắp hết đèn. Thua: hết Ngọn Lửa, hoặc trời sáng (300 / 330 / 360 s).

| Điểm | |
|---|---|
| Mỗi đom đóm **nạp** vào đèn | +10 |
| Mỗi đèn thắp | +100 |
| Mỗi Bóng Mực trúng Tỏa Sáng (mỗi con, mỗi lần) | +5 |
| Khi thắng: mỗi giây còn lại / mỗi Ngọn Lửa còn lại | +2 / +50 |

Tổng điểm game là tổng điểm các Đêm đã thắng.

## Chế độ headless (Test Contract v1.1)

Khai báo ở [`game.contract.json`](game.contract.json). Sau `npm ci && npm run build`:

```bash
node dist/headless.cjs --seed 42 --night 1 --ticks 600 --out out.jsonl \
  [--scenario scenario.json] [--inputs inputs.json] [--snapshot-every 10]
```

- `--night` nhận 1, 2 hoặc 3. Chạy 60 tick/s cố định, không cửa sổ. Một Đêm đầy đủ (21.600 tick) mất khoảng 0.2 s.
- File inputs/scenario sai định dạng thoát với mã `2`. Tham số dòng lệnh sai thoát với mã `1`.
- Snapshot v1.1 có `night`, `wind`, `player.{vel, grounded, invuln, dash_cd_s, pulse_cd_s, charm_s}` và các mảng `motes`, `drifters`, `charms`. Scenario nhận đủ các trường v1.1. Input có `dash` và `pause`.
- `night_start` được ghi ngay sau snapshot tick 0.
- Tất định: PRNG `mulberry32(seed)`. Cùng đầu vào thì output giống hệt nhau.
- Mọi khái niệm trong `tuning` đều có trong game nên không có `null`. Các giả định cho chỗ ticket chưa nói rõ (quy ước góc, điểm xuất phát Đêm 3, thời gian `spawning`…) nằm ở [docs/notes/phase-2.md](docs/notes/phase-2.md).

## Test và kiểm chứng

```bash
npm test                      # build + typecheck + unit + CLI (gồm đo hiệu năng headless) + mọi scenario headless
npm run verify                # chạy lại scenario mọi phase qua lệnh headless thật, ghi docs/proof/phase-N/
node scripts/screenshot.mjs   # ảnh chụp game (Chrome/Edge headless)
npm run bench                 # đo FPS thật ở 1280x720 (ghi docs/proof/phase-2/fps.md)
```

- Scenario: [`tests/scenarios/`](tests/scenarios/), sinh từ [`gen-specs.mjs`](tests/scenarios/gen-specs.mjs). Phase 1 có 16 spec (đã cập nhật theo số chuẩn, lý do ghi trong trường `changed`), Phase 2 có 19 spec.
- Báo cáo: [Phase 1](docs/proof/phase-1/report.md), [Phase 2](docs/proof/phase-2/report.md), [FPS](docs/proof/phase-2/fps.md).
- CI (Ubuntu + macOS) chạy test, verify, rồi so bằng chứng đã commit với output thật.

## Cấu trúc

```text
src/sim/      luật game thuần, tất định: tuning.ts (số chuẩn), maps.ts (3 bản đồ chuẩn), sim.ts (12 bước/tick)
src/cli/      lệnh headless
src/web/      bản 3D Three.js: world.ts (địa hình, mô hình), main.ts (luồng 3 Đêm, HUD, tạm dừng, cài đặt), sfx.ts (âm thanh)
tests/        unit, CLI, scenario headless theo phase
scripts/      build, serve, verify, screenshot, bench-fps, hooks
docs/notes/   giả định, tiêu chí nghiệm thu, đánh giá, nhật ký AI
docs/proof/   bằng chứng sinh tự động
AGENTS.md, CLAUDE.md, .claude/   harness AI
```

## Sáng tạo của tôi

Mọi phần dưới đây chỉ nằm trong `src/web/` và không làm đổi output headless (bằng chứng: toàn bộ scenario và kiểm tra tất định vẫn đạt).

1. **Âm thanh tạo bằng code (WebAudio, không dùng file):** nhạc nền mỗi Đêm một giọng, tiếng "ting" nhặt đom đóm cao dần theo số đang mang, tiếng báo gió, tiếng Gió Lạc cướp đồ, tiếng đếm ngược.
2. **Ông Đăng:** mỗi Đêm có một lời dặn riêng ở màn giới thiệu.
3. **Hiệu ứng nhỏ:** Bóng Mực lớn dần khi đang `spawning`, đom đóm rơi nhấp nháy khi sắp tan, lá bay theo hướng gió 2 s trước cơn gió, tháp chuông có chuông vàng.

Ảnh: [`docs/proof/phase-2/screenshots/`](docs/proof/phase-2/screenshots/).

## Ghi chép

- Phase 1: [docs/notes/phase-1.md](docs/notes/phase-1.md) · Phase 2: [docs/notes/phase-2.md](docs/notes/phase-2.md)
- Nhật ký dùng AI và token: [docs/notes/ai-log.md](docs/notes/ai-log.md)
- Giấy phép: [LICENSE](LICENSE) (MIT). Nguồn: [CREDITS.md](CREDITS.md)
