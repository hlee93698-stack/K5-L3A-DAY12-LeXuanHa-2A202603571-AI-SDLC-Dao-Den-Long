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

## 3. Tiêu chí nghiệm thu (Phần 3 và chuẩn hóa)

| Mục | Tiêu chí kiểm chứng được | Kiểm chứng |
|---|---|---|
| Số chuẩn | `tuning` khớp ticket. Phase 1 chạy lại với số mới | unit `contract`, spec P1 đã sửa |
| Lướt | 12 tick × 14 m/s = 2.8 m; hồi 90 tick; đứng yên thì lướt theo hướng mặt; trên không giữ Y | P2-01, P2-02 |
| Rơi khỏi đảo | Y < −10 → `player_hit {by:fall, lost}`; hồi sinh ở xuất phát sau 60 tick, bất tử 90 tick | P2-03 |
| Đom đóm rơi | Bị đánh → floor(n/2) đom đóm `dropped` trong vành 1.5–2.5 m, nhặt lại được, hết sau 480 tick | P2-04 |
| Trạng thái Bóng Mực | spawning → wander/chase; recoil 60 tick lùi 2 m; stunned 120 tick, đẩy 4 m trong 15 tick | P2-05, P2-06 |
| Lịch sinh | Đêm 1: 2 con ở tick 300, con thứ 3 ở 780; đom đóm thứ 21 ở tick 240 | P2-07 |
| Vùng an toàn | Bóng Mực bị chặn ở mép 6 m; con ở trong lúc vừa thắp bị đẩy ra trong ≤ 30 tick, không gây sát thương | P2-08 |
| Đêm 2 | 6 đèn, cầu tre, bục nhảy đưa Mây sang đảo kia | P2-09 |
| Đêm 3 | 7 đèn, 3 tầng, dốc lên tầng 1, vách chặn, gió mạnh ở tick 1800 | P2-10, P2-11 |
| Gió Lạc | idle → chase khi mang ≥ 5 và ≤ 15 m; cướp min(3, n), flee 240 tick rồi removed; Tỏa Sáng lúc flee thả lại đồ cướp | P2-12, P2-13 |
| Bùa Gió | Nhặt → 600 tick, chạy 7.2 m/s, lướt không hồi chiêu; xuất hiện lại sau 2700 tick | P2-14 |
| Tạm dừng | Tick tăng, sim_tick/thời gian đứng yên, `state: paused`, event paused/resumed | P2-15 |
| Thắng/thua cuối tick | Thắp đèn cuối đúng tick hết giờ → thắng | P2-16 |
| Hiệu năng headless | Đêm đầy đủ 21600 tick ≤ 30 s | P2-17 + đo thời gian |
| Chuỗi 3 Đêm, menu, giới thiệu, kết quả, Bình Minh | Luồng chơi trong bản web | ảnh chụp |
| Tạm dừng (UI), Cài đặt lưu giữa các lần mở | Esc/P mở menu; âm lượng và độ nhạy chuột lưu vào `localStorage` | ảnh chụp, đọc code |
| Âm thanh | Nhạc nền + hiệu ứng (nhặt, thắp, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s) | đọc code `sfx.ts` (không chụp được âm thanh) |
| HUD và bảng màu | Bố cục và màu theo ticket | ảnh chụp |
| ≥ 30 FPS ở 1280×720 | Đo FPS trung bình trong trình duyệt | số đo + cấu hình máy |
