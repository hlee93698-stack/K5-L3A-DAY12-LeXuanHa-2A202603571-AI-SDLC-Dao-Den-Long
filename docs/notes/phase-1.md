# Phase 1: PRD-0 + Test Contract v1.0

## 1. Giả định cho chỗ PRD-0 mơ hồ

| # | Chỗ mơ hồ | Giả định đã chọn | Lý do |
|---|---|---|---|
| A1 | "Tỏa sáng tốn ánh sáng": tốn gì? | Tốn `pulse_cost = 1` đom đóm đang mang. Không đủ thì không tỏa sáng được và không có event | Đom đóm chính là "ánh sáng" Mây mang theo |
| A2 | Bóng Mực sợ đèn: đèn nào? | Chỉ đèn **đã thắp** tạo vùng `safe_radius = 6` m mà Bóng Mực không vào được (bị đẩy ra cách tâm 6.01 m). Đèn chưa thắp không có tác dụng | "Đảo sáng dần lên khi thắp đèn": thắp đèn phải tạo ra tiến triển |
| A3 | Máu là gì? | `flames = 3` ngọn lửa. Hết lửa thì thua (`no_flames`) | Contract có `flames`, `per_flame_left` |
| A4 | Có giới hạn thời gian không? | Đêm dài 300 s. Hết giờ trước khi thắp đủ đèn thì thua (`dawn`) | Contract có `night1_duration_s` và reason `dawn` |
| A5 | Bị chạm thì đom đóm rơi đi đâu? | Mất `floor(carried × 0.5)` đom đóm (biến mất, không rơi lại xuống đất) | Đơn giản, không làm đổi `motes_active` một cách khó đoán |
| A6 | Nạp đèn | Phải bấm `interact` (kích hoạt theo cạnh) trong `interact_radius = 3` m. Nạp vào đèn **chưa thắp gần nhất**, lượng `min(carried, 5 − deposited)`. Nạp một phần được | Contract có event `deposit` với `amount` |
| A7 | Nhặt đom đóm | Tự động khi trong `pickup_radius = 1.5` m, nếu chưa đầy `carry_capacity = 10`. Cộng `per_mote` khi nhặt | |
| A8 | Rơi khỏi đảo | `fall_enabled = false`: mép đảo (bán kính 40 m) là tường, không có event `fall` | Ít rủi ro, chưa có yêu cầu phạt |
| A9 | Choáng | Choáng đúng `pulse_stun_s × 60 = 180` bước kể từ bước tỏa sáng (snapshot tick T…T+179 là `stunned`, T+180 là `chase`). Bóng Mực đang choáng không di chuyển và không gây sát thương. Tỏa sáng lên con đang choáng thì đặt lại thời gian choáng và vẫn tính điểm | |
| A10 | Đẩy lùi | Đẩy `pulse_push_m = 4` m ra xa người chơi theo phương ngang (trùng vị trí thì đẩy theo +X), sau đó giới hạn trong đảo và ngoài vùng an toàn | |
| A11 | Bất tử | Sau cú chạm ở tick T, cú chạm tiếp theo sớm nhất là T + 90 (1.5 s) | |
| A12 | Hồi chiêu | Tỏa sáng ở tick T thì lần tiếp theo sớm nhất ở tick T + 120 (2 s) | |
| A13 | Điểm thưởng cuối | Chỉ cộng **khi thắng**: `floor(time_left_s) × 2 + flames × 50` | |
| A14 | Bóng Mực mặc định | 3 con lúc bắt đầu (ở bán kính 35 m, theo seed). Mỗi 40 s sinh thêm 1 con (event `shade_spawned`), tối đa 6. Luôn đuổi người chơi. Tâm ở Y = 1 | |
| A15 | Đom đóm mặc định | 20 con rải trong vành 3–37 m theo seed. Khi `random_motes` bật, cứ 2 s sinh lại 1 con nếu đang dưới 20. Id tăng dần `M1, M2…` | Đủ đom đóm cho 25 cần thiết |
| A16 | Vị trí đèn | Vòng bán kính 25 m, L1 tại (0, 0, 25), mỗi đèn cách nhau 72° | |
| A17 | Scenario | `lit: true` mà không có `deposited` thì `deposited = 5`. `deposited ≥ 5` thì đèn sáng. Bóng Mực trong scenario không được tự đẩy ra khỏi vùng an toàn lúc dựng (snapshot 0 giữ đúng vị trí đã cho), mà bị đẩy ra ngay ở bước đầu tiên. Id Bóng Mực tự sinh tránh trùng id đã cho | Setup không phát event |
| A18 | Lỗi dòng lệnh | File inputs/scenario sai, không đọc được, JSON hỏng thì mã 2. Tham số CLI sai, `--night` khác 1 thì mã 1 | Contract chỉ quy định mã 2 cho file sai |
| A19 | Snapshot cuối | Chỉ ghi snapshot ở tick chia hết cho N (kể cả khi game kết thúc giữa chừng). Dòng `end` luôn là dòng cuối | Bám đúng chữ của contract |

**Thứ tự xử lý trong một bước** (quyết định tick của event): 1) đọc input, phát hiện cạnh nút → 2) di chuyển, nhảy → 3) nhặt đom đóm → 4) nạp đèn (có thể thắng) → 5) Bóng Mực: đếm choáng, đuổi, tránh đèn → 6) tỏa sáng → 7) Bóng Mực chạm người chơi (có thể thua) → 8) sinh đom đóm, Bóng Mực → 9) đồng hồ (`dawn`).

Ví dụ hệ quả: trong cùng một bước, đom đóm được nhặt **trước** khi nạp đèn. Tỏa sáng xử lý **trước** va chạm, nên tỏa sáng đúng lúc sẽ cứu được cú chạm trong bước đó.

## 2. Tiêu chí nghiệm thu và bằng chứng

| Yêu cầu | Tiêu chí kiểm chứng được | Bằng chứng | Kết quả |
|---|---|---|---|
| Đi lại, camera 3D | `move [0,1]` 1 s đi đúng 6 m theo +Z; `cam_yaw_deg` xoay hướng đúng công thức; vector dài được chuẩn hóa | P1-01, P1-02, unit `movement` | PASS |
| Nhảy | Nhảy kích hoạt theo cạnh, Y > 0 rồi về 0 | P1-03 | PASS |
| Nhặt đom đóm | Nhặt trong ≤ 1.5 m, không nhặt khi đầy, +10 điểm | P1-04, P1-15 | PASS |
| Nạp, thắp đèn | Nạp trong ≤ 3 m, đủ 5 thì thắp, +100 | P1-05, P1-15 | PASS |
| Thắng | Thắp đèn cuối → `game_over won all_lit`, điểm đúng công thức (848) | P1-06 | PASS |
| Tỏa sáng | Choáng trong 6 m, đẩy 4 m, tốn 1, +20, choáng 3 s, hồi 2 s | P1-07, P1-08 | PASS |
| Bóng Mực đuổi, gây sát thương | -1 lửa, rơi floor(50%), bất tử 1.5 s, hết lửa → thua | P1-09 | PASS |
| Bóng Mực sợ đèn | Không bao giờ vào trong 6 m của đèn đã thắp (kiểm tra mọi snapshot, 600 tick) | P1-10 | PASS |
| Hết giờ | `time_left_s` giảm đúng, về 0 → `lost dawn` | P1-11 | PASS |
| Scenario | Dựng không phát event, không cộng điểm | P1-12 | PASS |
| Lỗi file → mã 2 | inputs hoặc scenario sai → exit 2, có stderr | P1-13, P1-14, `tests/cli.test.ts` | PASS |
| Tất định | Chạy hai lần giống hệt (mọi scenario, kể cả đêm đầy đủ 18000 tick) | Cột sha256 trong report; P1-16 | PASS |
| Định dạng output | Snapshot từ tick 0 mỗi N tick, event có `tick` = k+1, dòng `end` cuối, làm tròn 3 chữ số | `tests/cli.test.ts` | PASS |
| `tuning` khai đúng | `game.contract.json` khớp số trong code | `tests/sim.test.ts` › contract | PASS |
| HUD, thắng/thua, chơi lại | HUD hiện lửa, đom đóm, đèn, thời gian, điểm, hồi chiêu; màn kết thúc có "R để chơi lại" | `docs/proof/phase-1/screenshots/` | PASS (xem ảnh) |
| Phong cách | Mây đội nón lá có đèn nhỏ; ánh vàng cam = tốt, tím đen = nguy hiểm; đảo sáng dần | Ảnh `lantern-lit-hud.png` | PASS (xem ảnh) |
| Chơi từ đầu đến thắng/thua | Luồng menu → chơi → kết thúc → chơi lại | Ảnh `menu.png`, `game-over.png`; chơi tay | PASS |

Báo cáo đầy đủ (lệnh chạy lại được, output thô): [../proof/phase-1/report.md](../proof/phase-1/report.md).

## 3. Đánh giá Phase 1

- **Đạt:** mọi mục trong bảng trên. 58 test (unit, CLI, scenario) xanh. 16/16 scenario headless đạt và tất định.
- **Rủi ro còn lại:** test ẩn có thể hiểu khác giả định A2 (đèn chưa thắp có đẩy Bóng Mực không) và A19 (snapshot cuối khi game kết thúc giữa chừng). Cả hai đã ghi rõ ở trên. Nên hỏi trợ giảng Phase 1 để xác nhận.
- **Harness:** `AGENTS.md`/`CLAUDE.md`, Stop hook chặn kết thúc khi `npm test` đỏ, PreToolUse hook chặn sửa tay `docs/proof/**`, skill `verify-phase`, CI so bằng chứng đã commit với output thật.
- **Cần chỉnh:** không có lỗi lặp lại của AI ở phase này nên chưa thêm quy tắc. Xem [ai-log.md](ai-log.md).
