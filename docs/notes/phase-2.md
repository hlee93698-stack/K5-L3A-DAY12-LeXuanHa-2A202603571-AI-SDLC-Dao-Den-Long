# Phase 2: Ticket-02 "Ba hòn đảo" (Contract v1.1)

Ticket-02 thay toàn bộ số tự chọn của Phase 1 bằng **số chuẩn**, thêm 3 Đêm (bản đồ chuẩn), Lướt, rơi khỏi đảo, Gió Lạc, Bùa Gió, gió mạnh, tạm dừng, cùng định dạng snapshot và scenario v1.1.

## 1. Thay đổi so với Phase 1 (luật cũ bị thay)

| Luật Phase 1 | Luật Phase 2 (ticket) | Ảnh hưởng tới test cũ |
|---|---|---|
| `lantern_cost` 5, `pickup_radius` 1.5, `interact_radius` 3 | 10, 1.0, 2.0 | Sửa giá trị mong đợi trong spec P1 |
| Tỏa sáng: tốn 1, bán kính 6, choáng 3 s, hồi 2 s, đẩy ngay 4 m | Tốn 3, bán kính 5 (3D từ chân + 0.8 m), choáng 120 tick, hồi 3 s, đẩy 4 m chia đều trong 15 tick | Sửa P1-07, P1-08 |
| +10 điểm khi **nhặt** đom đóm, +20 mỗi lần choáng | +10 mỗi đom đóm **nạp**, +5 mỗi Bóng Mực trúng Tỏa Sáng | Sửa P1-04, P1-05, P1-06, P1-07 |
| Rơi đom đóm khi bị đánh: biến mất | Rơi ra vành 1.5–2.5 m, tồn tại 480 tick, nhặt lại được | Sửa P1-09 (thêm kiểm tra đom đóm rơi) |
| Mép đảo là tường (`fall_enabled: false`) | Ra ngoài là rơi (Y < −10): −1 lửa, mất hết đom đóm, hồi sinh sau 60 tick | Bỏ unit test "island edge is a wall"; thêm P2 về rơi |
| 3 Bóng Mực có sẵn lúc đầu, sinh mỗi 40 s | 0 lúc đầu; 2 con ở tick 300, sau đó mỗi 8 s (Đêm 1) | Sửa unit test spawn |
| Bóng Mực luôn đuổi, trạng thái `chase`/`stunned` | `spawning`/`wander`/`chase`/`recoil`/`stunned`; phát hiện 12 m, bỏ đuổi 18 m; chạm xong lùi 2 m trong 60 tick | Unit test "shade chases" đặt Bóng Mực ≤ 12 m |
| Vùng an toàn: đẩy ra ngay 6.01 m | Chặn ở mép 6 m; con đang ở trong lúc đèn vừa thắp bị đẩy ra trong ≤ 30 tick, không gây sát thương | Sửa P1-10 |
| Thắng xét ngay khi nạp; thứ tự bước tự đặt | Thứ tự bước bắt buộc theo ticket (12 bước); thắng/thua xét cuối tick | Không đổi tick của event trong spec cũ |
| Đom đóm mặc định: 20 điểm ngẫu nhiên, sinh lại mỗi 2 s | 20 trong 24 điểm chuẩn, sinh thêm ở tick 240k (trần 30) | Sửa unit test respawn |
| Vị trí đèn L2…L5 làm tròn từ vòng 25 m | Vị trí chuẩn (23.8, 0, 7.7)… | Sửa P1-06 |

Các test cũ đều **sửa kèm lý do** như bảng trên, không tắt test nào. Spec Phase 1 vẫn nằm ở `tests/scenarios/phase-1/` và chạy cùng spec Phase 2.

## 2. Giả định cho chỗ ticket chưa nói rõ

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| B1 | Quy ước góc | Ticket ghi "ngược chiều kim đồng hồ từ +X", nhưng dữ liệu bản đồ (tầng 1 ở nửa z > 0, dốc ở 30° và 150°, đom đóm tầng 1 ở 20°…160°) chỉ khớp với `x = r·cos θ, z = r·sin θ`. Dùng công thức này cho mọi điểm và cho `wind.dir_deg` |
| B2 | Xuất phát Đêm 2/3 | Đêm 2: (0, 0, 0) ở đảo A. Đêm 3: (0,0,0) nằm trong tháp chuông nên chọn **(0, 0, −30)** ở tầng 0. Luôn quay mặt về +Z |
| B3 | Tăng tốc ≤ 0.1 s | Vận tốc ngang đạt ngay (0 s), dừng ngay. Trên không điều khiển như dưới đất |
| B4 | Vách, dốc | Chân Mây/Bóng Mực leo được bậc ≤ 0.35 m, cao hơn là tường. Xuống thấp hơn 0.35 m thì rơi tự do |
| B5 | Lướt | Không lướt khi đang chờ hồi sinh. Khi lướt bỏ qua phím nhảy. Hồi chiêu 90 tick tính từ tick bắt đầu (có Bùa thì 0). Lướt trên không giữ Y và vy = 0, hết lướt thì rơi |
| B6 | Bục nhảy | Kích hoạt khi chân Mây đang chạm đất và XZ ≤ 1 m tới tâm bục. Vận tốc phóng đặt ở cuối bước 3, áp dụng từ tick sau |
| B7 | Trạng thái `spawning` | Kéo dài 60 tick (1 s): không di chuyển, không gây sát thương, có thể bị Tỏa Sáng |
| B8 | Trạng thái `wander` | Lượn 2 m/s theo hướng ngẫu nhiên (theo seed), đổi hướng mỗi 120 tick hoặc khi bị chặn |
| B9 | Phát hiện / bỏ đuổi | Đo XZ. `wander` → `chase` khi ≤ 12 m; `chase` → `wander` khi > 18 m. Hết choáng/lùi thì về `chase` nếu ≤ 18 m, ngược lại `wander` |
| B10 | Shade trong scenario | Không ghi `state` thì là `chase` nếu ≤ 12 m, ngược lại `wander`. `pos.y` được đặt lại = mặt đất + 1 (tâm). `state_ticks_left` mặc định: stunned 120, recoil 60, spawning 60 |
| B11 | Điểm sinh Bóng Mực hợp lệ | Cách người chơi ≥ 15 m (XZ) và không nằm trong vùng an toàn của đèn đã sáng. Hai con ở tick 300 lấy hai điểm khác nhau |
| B12 | Điểm trống cho đom đóm | Không có đom đóm nào trong 0.5 m (XZ). Trần 30 tính **mọi** đom đóm đang có (ngẫu nhiên + rơi) |
| B13 | Đom đóm rơi | Góc đều nhau quanh Mây, lệch ngẫu nhiên, bán kính ngẫu nhiên trong [1.5, 2.5]. Y = mặt đất tại đó (không có đất thì lấy Y của Mây). `ttl_s` của đom đóm ngẫu nhiên là `null` |
| B14 | Chạm Gió Lạc | Chỉ Gió Lạc ở `chase` mới cướp được, và chỉ khi Mây mang > 0. Gió Lạc bay, không bị địa hình chặn, Y = mặt đất + 1.2. Điểm sương = điểm sinh Bóng Mực của Đêm. `removed` vẫn nằm trong mảng snapshot. Tối đa 2 tính các con chưa `removed` |
| B15 | Tỏa Sáng trúng Gió Lạc `idle` | Không có tác dụng. `pulse.stunned_ids` chỉ chứa Bóng Mực |
| B16 | Gió mạnh Đêm 3 | Cơn gió bắt đầu ở sim_tick 1800, 3600, … kéo dài 300 tick. Hướng ngẫu nhiên theo seed, chọn lúc bắt đầu báo trước (2 s trước). `wind.dir_deg` = `null` khi không có gió. Gió chỉ đẩy Mây |
| B17 | Tạm dừng | Nhấn `pause` (cạnh lên) là đảo trạng thái. Tick vừa tạm dừng phát event `paused` rồi dừng. Tick vừa tiếp tục phát `resumed` rồi chạy bình thường. Dòng `end` khi đang tạm dừng có `state: "paused"` |
| B18 | `night_start` | Ghi ngay sau snapshot tick 0, với `tick: 0` (dòng đầu tiên vẫn là snapshot 0) |
| B19 | `player.invuln` | Boolean (đang bất tử hay không). Các trường `*_s` là giây còn lại, làm tròn 3 chữ số |
| B20 | Bóng Mực đang bị đẩy ra khỏi vùng an toàn | Giữ nguyên `state`, không gây sát thương. Mỗi tick di chuyển ra ngoài đều sao cho tới mép đúng ở tick thứ 30 |
| B21 | Rơi khi đang chờ hồi sinh | Mây đứng yên tại chỗ rơi. Không nhặt, không tương tác, không Tỏa Sáng, không bị cướp |
| B22 | Điểm khi thua | Dòng `end` của headless ghi điểm của Đêm đó. Bản chơi: tổng điểm game chỉ cộng các Đêm đã thắng |

## 3. Tiêu chí nghiệm thu và kết quả

Spec headless: `tests/scenarios/phase-2/` (sinh từ `tests/scenarios/gen-specs.mjs`). Báo cáo: [../proof/phase-2/report.md](../proof/phase-2/report.md).

| Mục | Tiêu chí kiểm chứng được | Kiểm chứng | Kết quả |
|---|---|---|---|
| Số chuẩn | `tuning` khớp ticket; spec Phase 1 chạy lại với số mới | unit `contract v1.1`; P1-01…P1-16 | PASS |
| Lướt | 12 tick × 14 m/s = 2.8 m; hồi 90 tick tính từ lúc bắt đầu; đứng yên thì lướt theo hướng mặt; trên không giữ Y | P2-01, P2-02, unit | PASS |
| Rơi khỏi đảo | Y < −10 → `player_hit {by: fall, lost}` đúng 1 lần; hồi sinh ở xuất phát sau 60 tick, bất tử | P2-03, P2-10 | PASS |
| Đom đóm rơi | Bị đánh → floor(n/2) đom đóm `dropped` ở vành 1.5–2.5 m, ttl 8 s, nhặt lại được, tan khi hết ttl | P2-04, P2-05, P1-09 | PASS |
| Trạng thái Bóng Mực | `spawning` → `wander`/`chase`; `recoil` lùi 2 m/60 tick; `stunned` 120 tick, đẩy 4 m/15 tick, làm mới khi trúng lại | P2-06, P1-07, unit | PASS |
| Chạm | Tối đa 1 lần mất lửa mỗi tick, theo id tăng dần; bất tử thì không có tác dụng | unit | PASS |
| Lịch sinh | 20 đom đóm, +1 ở tick 240; S1+S2 ở tick 300, S3 ở 780; tối đa 6; cách người chơi ≥ 15 m; trần 30 đom đóm, chỉ điểm trống | P2-07, unit | PASS |
| Vùng an toàn | Chặn ở mép 6 m; con ở trong lúc vừa thắp bị đẩy ra trong 30 tick, không gây sát thương | P2-08, P1-10 | PASS |
| Tỏa Sáng 3D | Tâm = chân + 0.8 m; mục tiêu theo khoảng cách 3D ≤ 5 m | unit | PASS |
| Đêm 2 | 6 đèn đúng vị trí; cầu tre đi được, bước ra mép cầu thì rơi; bục nhảy đưa sang đảo B | P2-09, P2-10 | PASS |
| Đêm 3 | 7 đèn; dốc lên tầng 1 (Y=3); vách tầng 2 chặn; tháp không leo được; mọi điểm đom đóm/đèn nằm đúng tầng | P2-11, unit `maps` | PASS |
| Gió mạnh | Tick 1800, 300 tick, đẩy 2 m/s (đúng 10 m) | P2-12 | PASS |
| Gió Lạc | idle → chase (mang ≥ 5, ≤ 15 m) → cướp 3 → flee 240 → removed; Tỏa Sáng: chase → flee không cướp, flee → thả đồ, tan sau 120 tick; spawn tick 1200 chỉ ở Đêm 2/3 | P2-13, P2-14, unit | PASS |
| Bùa Gió | Nhặt → `charm_picked`, 600 tick, 7.2 m/s; lướt không hồi chiêu nhưng phải bấm lại; xuất hiện lại sau 2700 tick | P2-15, P2-16 | PASS |
| Tạm dừng (logic) | Tick tăng, sim_tick/thời gian/di chuyển đứng yên, `state: paused`, event `paused`/`resumed` | P2-17 | PASS |
| Thắng/thua cuối tick | Thắp đèn cuối đúng tick hết giờ → thắng | P2-18 | PASS |
| Hiệu năng headless | Đêm đầy đủ ≤ 30 s | `tests/cli.test.ts` (đo cả 3 Đêm, ~0.2 s mỗi Đêm), P2-19 | PASS |
| Chuỗi 3 Đêm | Menu → giới thiệu (tên đảo, lời Ông Đăng) → chơi → kết quả → Đêm kế; thắng Đêm 3 → Bình Minh với tổng điểm; thua → chơi lại Đêm đó | ảnh `menu`, `intro-night2`, `dawn`; đọc `main.ts` | PASS (ảnh + chơi tay) |
| Tạm dừng (UI) | Esc/P → Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu; logic dừng hẳn | ảnh `pause-menu` | PASS |
| Cài đặt | Âm lượng, độ nhạy chuột lưu vào `localStorage` | đọc code `main.ts` (`ddl-settings`) | PASS (chưa có test tự động) |
| Âm thanh | Nhạc nền + hiệu ứng nhặt, thắp, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s | đọc code `sfx.ts` + `handleEvents` | PASS. Tiếng nhảy: bản web tự nhận ra lúc Mây rời đất với vy ≤ 7 (sim không có event nhảy) |
| HUD | Lửa trên trái; đồng hồ mm:ss trên giữa, đỏ và nhấp nháy khi ≤ 30 s; đèn k/n và điểm trên phải; thanh 10 ô dưới giữa; hồi chiêu Lướt/Tỏa Sáng dưới phải; nhắc "E — Nạp ánh sáng (x/10)"; mũi tên tới đèn chưa sáng ngoài màn hình | ảnh `night1-hud`, `night3-tiers` | PASS |
| Bảng màu, ánh sáng môi trường | Màu chuẩn trong `world.ts` (`PAL`) và CSS; `ambient = 0.15 + 0.55 × lit/total` | đọc code; ảnh | PASS |
| ≥ 30 FPS ở 1280×720 | Đo thật trên Chrome, Đêm 3 | [fps.md](../proof/phase-2/fps.md): 59.9 FPS trung bình (Intel Iris Xe) | PASS |

## 4. Đánh giá Phase 2

- **Đạt:** 68 test (unit + CLI + scenario) xanh. 35/35 scenario headless (16 của Phase 1 đã cập nhật, 19 mới) đạt và tất định. FPS 59.9.
- **Hồi quy Phase 1:** mọi spec Phase 1 vẫn chạy. Spec bị luật mới làm sai đều được sửa, lý do ghi ở trường `changed` và bảng mục 1. Unit test cũ được viết lại cho v1.1 vì gần như mọi số đều đổi.
- **Chưa đạt / rủi ro:** (1) Cài đặt và âm thanh chỉ kiểm chứng bằng đọc code và chơi tay, chưa có test tự động. (2) Các giả định B1 (quy ước góc), B2 (xuất phát Đêm 3), B7 (`spawning` 60 tick), B16 (`dir_deg = null` khi không có gió), B18 (vị trí `night_start`) có thể khác test ẩn, nên hỏi trợ giảng Phase 2. (3) Ảnh trong `docs/proof/phase-1/screenshots/` là giao diện của tag `phase-1`, không phải giao diện hiện tại.
- **Harness:** AGENTS.md được cập nhật (bản đồ, quy ước góc, spec sinh từ `gen-specs.mjs`, cảnh báo về lệnh chờ stdin). Skill `verify-phase` thêm bước kiểm tra tác dụng phụ của bản đồ và đo FPS. Thêm `scripts/bench-fps.mjs`.
