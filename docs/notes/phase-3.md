# Phase 3: Ticket-03 "Đèn cạn dầu" (Contract v1.2)

## ADR-003: Đèn có nhiên liệu, thắng bằng cách giữ đảo sáng tới bình minh

**Bối cảnh.** Ticket-03 thay ba luật cốt lõi: đèn sáng là vĩnh viễn, vùng an toàn tuyệt đối, và thắng ngay khi thắp hết đèn.

**Quyết định.**
1. **Mô hình trạng thái đèn:** `unlit(ever_lit=false)` → thắp (10 đom đóm) → `lit(fuel)` → hết dầu → `unlit(ever_lit=true)` → thắp lại (5 đom đóm) → `lit`. Đèn lưu `fuelU` là **số nguyên tính bằng 1/60 đơn vị** (tối đa 6000), nên hao 1/giây là −1 mỗi tick và bị hút 5/giây là −5 mỗi tick; không có sai số số thực. Khi xuất ra mới chia 60 và làm tròn 1 chữ số. Đèn còn đếm `relit_count`.
2. **Vùng an toàn** là thuộc tính tính ra từ trạng thái: chỉ có khi `lit && fuel ≥ 30`. Các chỗ chặn Bóng Mực, đẩy Bóng Mực ra và chọn điểm sinh đều gọi chung một hàm `safeActive(l)`. Việc đẩy ra khi châm dầu lên ≥ 30 dùng lại đúng bước 6 có sẵn (đẩy mọi Bóng Mực đang ở trong vùng đang hoạt động), nên không cần thêm nhánh riêng.
3. **Luật thắng** chỉ xét ở bước 11, sau mọi cập nhật của tick: hết Ngọn Lửa → `no_flames`; hết giờ → so số đèn đang sáng với `ceil(0.6 × n)` → `dawn_survived` hoặc `dawn`. Bỏ nhánh thắng sớm ở bước nạp đèn.
4. **Bóng Mực `drain`:** thêm trạng thái thứ 6 cùng `target` (id đèn). `wander` hướng về đèn yếu gần nhất; trong 2 m thì sang `drain`. Lượng bị hút được tính ở bước 2 cùng lúc với hao tự nhiên, nên đèn tắt ngay sau bước 2 như ticket yêu cầu.

**Hệ quả.** Spec cũ dựa vào "thắng khi thắp hết" (P1-06, P2-18) được viết lại thành "sống tới bình minh". Điểm đổi toàn bộ nên các spec có kiểm tra điểm đều được cập nhật, kèm trường `changed`. Thời lượng Đêm giảm làm thay đổi số tick ở cuối các spec chạy hết đêm.

## Giả định (chỗ ticket chưa nói rõ)

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| C1 | `wander` khi không có đèn yếu, "đi về đèn tắt gần nhất như trước" | Đi về đèn tắt gần nhất với tốc độ lượn 2 m/s, tới trong 4 m thì lượn ngẫu nhiên như Phase 2. Không còn đèn tắt thì lượn ngẫu nhiên |
| C2 | Tốc độ khi đi tới đèn yếu | 2 m/s (tốc độ `wander`) |
| C3 | `drain` → `chase` khi Mây trong 6 m | Đo XZ. `drain` không tự chuyển sang `chase` theo ngưỡng 12 m |
| C4 | Hết `recoil` | Giữ như Phase 2 (`chase` nếu ≤ 18 m, ngược lại `wander`). Hết choáng thì về `wander` theo ticket |
| C5 | `fuel_drain` mỗi 60 tick | Mỗi con đang `drain` có bộ đếm riêng, phát event ở tick hút thứ 60, 120, … `fuel` là giá trị sau khi trừ ở tick đó |
| C6 | `score.*` trong tuning | `per_mote` = 5, `per_stun` = 5, `per_second_left` = 0 (bỏ thưởng thời gian), `per_flame_left` = 50. Thắp lại +40 và thưởng +15 cho con đang `drain` nằm trong code (`K`) |
| C7 | Đèn đặt sẵn trong scenario `lit: true` | `ever_lit` = true nếu không ghi, `fuel` = 100 nếu không ghi, không tính vào `successful_lights` |
| C8 | Sức chứa giảm khi đèn tắt? | Không. `successful_lights` chỉ tăng trong Đêm |

## Tiêu chí nghiệm thu và kết quả

Spec: `tests/scenarios/phase-3/`. Báo cáo: [../proof/phase-3/report.md](../proof/phase-3/report.md).

| Mục | Tiêu chí | Kiểm chứng | Kết quả |
|---|---|---|---|
| Nhiên liệu | Hao 1/s theo đơn vị nguyên 1/60; hết thì `lantern_out`, deposited 0, ever_lit giữ | P3-01, unit `fuel` (đúng 6000 tick) | PASS |
| Thắp lại | 5 đom đóm, +40, `relight: true`, relit_count +1 | P3-01 | PASS |
| Châm dầu | used = min(n, ceil((100−fuel)/10)), +5 mỗi con | P3-02, unit | PASS |
| Hút dầu | wander → đèn yếu → drain trong 2 m, `fuel_drain` mỗi 60 tick, đèn tắt → wander | P3-03 | PASS |
| Vùng an toàn | Mất khi fuel < 30; châm lên ≥ 30 đẩy Bóng Mực ra trong 30 tick | P3-07 | PASS |
| Tỏa Sáng lên con đang drain | +15 | P3-04 | PASS |
| Luật thắng | Không thắng sớm; bình minh ≥ ceil(0.6n) → dawn_survived, ngược lại dawn; hết lửa ở tick cuối → no_flames | P1-06, P2-18, P3-05, unit | PASS |
| Sức chứa | 10 + 2 × lần thắp, tối đa 20 | P3-01, P3-06 | PASS |
| Điểm mới | +5/đom đóm, +100/+40, bình minh 50 + floor(fuel) mỗi đèn sáng, +50 mỗi lửa | P1-05, P1-06, P2-18, P3-01, P3-02 | PASS |
| Web: thanh dầu, nhấp nháy 1 Hz khi < 30, sức chứa trên HUD | | ảnh `docs/proof/phase-3/screenshots/night1-hud.png` | PASS (nhấp nháy: đọc code) |
| Bảng màu dễ phân biệt | Lưu được; viền Bóng Mực #00B3FF; cảnh báo trắng + ⚠; đèn tắt xẹp 20% và có vết rách | đọc code `main.ts`, `world.ts` | PASS một phần: mắt Bóng Mực chưa đổi màu, chỉ đổi viền |

## Test cũ bị luật mới làm sai (đã sửa, không skip)

| Test | Lý do |
|---|---|
| P1-05 | Điểm +5/đom đóm: 200 → 150 |
| P1-06 | Bỏ thắng sớm: viết lại thành sống tới bình minh (dawn_survived, 1045 điểm) |
| P1-12 | Đèn trong snapshot có thêm fuel, ever_lit, relit_count |
| P2-17 | Đêm 1 dài 240 s: time_left 299.833 → 239.833 |
| P2-18 | Lý do thắng dawn_survived, điểm mới 1046 |
| P2-19 | Đêm 3 dài 300 s: 21600 → 18000 tick |
| unit `contract`, `standard numbers`; CLI snapshot player, full-night ticks | contract 1.2, thời lượng mới, trường `capacity` |

## Đánh giá Phase 3

- 42/42 scenario (16 + 19 + 7) và toàn bộ unit/CLI test đạt; tất định.
- Rủi ro: giả định C1 (wander về đèn tắt) và C5 (nhịp `fuel_drain` theo từng con) có thể khác test ẩn.
- AI sai: comment `//` chèn giữa dòng làm mất nửa object trong test; thanh dầu dạng mặt phẳng không hiện → đổi sang Sprite sau khi xem ảnh; một ảnh Đêm 3 bị trống do chụp quá sớm → chụp lại.
