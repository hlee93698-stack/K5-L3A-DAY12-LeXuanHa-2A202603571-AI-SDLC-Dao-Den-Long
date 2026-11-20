# Changelog

Mỗi phase là một phiên bản. Muốn xem lại đúng code của phiên bản nào thì checkout commit tương ứng (hoặc tag khi đã gắn).

| Phiên bản | Contract | Commit cuối | Tag nên gắn | Ghi chú chi tiết |
|---|---|---|---|---|
| Phase 1 | 1.0 | `71d2446` | `phase-1` | [docs/notes/phase-1.md](docs/notes/phase-1.md) |
| Phase 2 | 1.1 | `868ed9c` | `phase-2` | [docs/notes/phase-2.md](docs/notes/phase-2.md) |
| Phase 3 | 1.2 | `fe9372c` | `phase-3` | [docs/notes/phase-3.md](docs/notes/phase-3.md) (có ADR-003) |
| Phase 4 = **v1.0.0** | 1.3 | commit "Phase 4 docs" (xem `git log`) | `phase-4` + Release `v1.0.0` | [docs/notes/phase-4.md](docs/notes/phase-4.md) (có ADR-004), [retro](docs/notes/retro.md) |

## Phase 4 / v1.0.0 (contract 1.3) — KHÔNG breaking với 1.2

Luật mô phỏng và output headless giữ nguyên (mọi scenario cũ vẫn đạt, `verify` sinh lại không khác). Chỉ thêm:

- **Contract:** `contract_version` 1.3, thêm `bench_cmd` (`node scripts/bench.mjs`) và `soak_cmd` (`node dist/headless.cjs --soak`).
- **Bench:** cảnh `?bench=1` (Đêm 1, 200 Bóng Mực, 100 đom đóm, 3 đèn sáng, camera bay vòng), ghi `bench.json`.
- **Soak:** cờ `--soak --seed --nights --out` cho lệnh headless, ghi `soak.json`.
- **Bảng xếp hạng:** nhập tên sau khi thua/Bình Minh, xem từ menu, top 10; `data/leaderboard.json` qua `/api/leaderboard`; xuất bằng `npm start -- --export-leaderboard out.json`.
- **Trợ năng:** đổi phím (đổi chỗ khi trùng, khôi phục mặc định), giảm chuyển động, chữ lớn ×1.25, chữ nội dung ≥ 18 px, mũi tên báo Bóng Mực mới xuất hiện.
- **Hiệu năng:** Bóng Mực gộp từ 7 mesh còn 3 mesh dùng chung geometry.
- **Hình ảnh** (commit `7e18051`): Mây mặc áo dài, đội nón lá, cầm đèn lồng nhỏ; Bóng Mực hình giọt mực, Gió Lạc dạng xoáy, cây dừa, lan can cầu tre, đèn treo trên tháp. Chỉ ở `src/web/`.

## Phase 3 (contract 1.2) — BREAKING so với 1.1

- **Thắng:** bỏ thắng sớm khi thắp hết đèn (`all_lit` không còn dùng). Thắng khi còn sống lúc bình minh và số đèn đang sáng ≥ ceil(0.6 × tổng): `game_over.reason = "dawn_survived"`.
- **Thời lượng Đêm:** 300/330/360 s → 240/270/300 s.
- **Đèn có nhiên liệu:** đèn sáng hao 1 fuel/giây, hết thì tắt (`lantern_out`). Thắp lại cần 5 đom đóm. Đèn sáng chưa đầy dầu nhận châm dầu (`refuel`).
- **Vùng an toàn** chỉ còn khi fuel ≥ 30. Bóng Mực có trạng thái mới `drain` (hút 5 fuel/giây). Hết choáng thì về `wander` (trước: `chase` nếu gần).
- **Điểm:** +5 mỗi đom đóm nạp (trước: +10), +100 thắp lần đầu, +40 thắp lại, +5 mỗi Bóng Mực trúng Tỏa Sáng (+15 nếu nó đang `drain`), bình minh +50 + floor(fuel) mỗi đèn sáng và +50 mỗi Ngọn Lửa. Bỏ thưởng thời gian.
- **Sức chứa** = 10 + 2 × số lần thắp thành công, tối đa 20.
- **Snapshot:** đèn thêm `fuel`, `ever_lit`, `relit_count`; player thêm `capacity`. **Sự kiện mới:** `refuel`, `lantern_out`, `fuel_drain`; `lantern_lit` thêm `relight`.
- **Scenario:** đèn nhận `fuel`, `ever_lit`; player nhận `successful_lights`; shades nhận `target_lantern_id`.
- **Tuning** thêm `fuel_max`, `fuel_decay_per_s`, `fuel_per_mote`, `relight_cost`, `win_ratio`, `drain_per_s`, `low_fuel_threshold`, `capacity_max`.
- **Bản web:** thanh dầu trên đèn, nhấp nháy khi < 30, sức chứa trên HUD, cài đặt "Bảng màu dễ phân biệt".

## Phase 2 (contract 1.1) — BREAKING so với 1.0

- **Số chuẩn thay số tự chọn:** lantern_cost 5→10, pickup 1.5→1.0 m, interact 3→2 m, pulse cost 1→3, bán kính 6→5 (đo 3D), choáng 3 s→120 tick, hồi 2→3 s, điểm +10 khi nạp (trước: khi nhặt).
- **3 Đêm** với bản đồ chuẩn; `--night 1|2|3`. Rơi khỏi đảo (trước: mép đảo là tường). Bóng Mực có 5 trạng thái, không còn 3 con lúc bắt đầu (2 con ở tick 300).
- **Mới:** lướt, bục nhảy, đom đóm rơi, Gió Lạc, Bùa Gió, gió mạnh, tạm dừng.
- **Snapshot/scenario v1.1:** `night`, `wind`, player.{vel, grounded, invuln, dash_cd_s, pulse_cd_s, charm_s}, mảng `drifters`, `charms`; event `dash`, `charm_picked`, `drifter_steal`, `drifter_drop`, `night_start`, `paused`, `resumed`.
- Spec Phase 1 được sửa theo số chuẩn (lý do ở trường `changed`).

## Phase 1 (contract 1.0)

- Bản đầu tiên: Đêm 1 (5 đèn), lõi mô phỏng tất định, chế độ headless, bản web Three.js, 16 scenario, harness (AGENTS.md, hooks, skill), CI.
