# Nhật ký dùng AI

Công cụ: **Claude Code** (VS Code extension), model Claude Opus. Harness: [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md), [.claude/settings.json](../../.claude/settings.json) (hooks), [.claude/skills/verify-phase](../../.claude/skills/verify-phase/SKILL.md).

## Phase 1

**Lời nhắc chính:** "Đọc thông tin dự án và xem cần làm gì", sau đó "tự chọn cách tối ưu nhất và bắt đầu làm từ đầu".

**Cách làm với agent:**
1. Agent đọc toàn bộ tài liệu lab và trang lab board (PRD-0 + Test Contract v1.0) trước khi chọn kiến trúc.
2. Chọn kiến trúc tách lõi mô phỏng thuần, tất định (`src/sim`) khỏi hiển thị (`src/web`) để headless và bản chơi dùng chung luật.
3. Viết test từ luật và tuning (giá trị mong đợi tính tay), rồi chạy thật qua lệnh headless.
4. Chụp ảnh bằng Chrome headless để kiểm tra phần chỉ nhìn mới thấy.

**AI sai ở đâu, phát hiện thế nào:**

| Lỗi | Phát hiện | Xử lý |
|---|---|---|
| Test "spawn Bóng Mực sau 40 s" để người chơi đứng yên 40 s, nhưng 3 Bóng Mực mặc định đã giết người chơi trước đó nên không bao giờ tới mốc spawn | Tự đọc lại logic trước khi chạy (thời gian Bóng Mực tới nơi ≈ 8.5 s) | Scenario cho `flames: 1000` để đo đúng một luật |
| Test CLI kỳ vọng `game_over` ở dòng áp chót, quên rằng tick 30 chia hết cho 10 nên có snapshot chen giữa | `npm test` đỏ | Sửa kỳ vọng theo đúng thứ tự contract (event → snapshot → end) |
| Spec P1-15 kiểm tra snapshot tick 5 trong khi `snapshot_every` mặc định là 10 | `npm run verify` báo "no snapshot at tick 5" | Đặt `snapshot_every: 1` |
| Spec P1-15 ban đầu kỳ vọng nhặt đom đóm ở tick 6, nhưng theo thứ tự bước (nhặt trước nạp) thì phải là tick 7 | Đối chiếu với thứ tự bước đã ghi trước khi chạy | Sửa spec, ghi thứ tự bước vào notes |
| Lần thử hook đầu tiên báo hook không chặn được | Thử lại bằng file JSON chuẩn: lỗi do cách escape `\\` trong lệnh thử, hook vẫn đúng | Không cần sửa hook |
| Ảnh đầu tiên: cây che camera, cảnh quá tối | Xem ảnh chụp | Dồn cây ra mép đảo, tăng ánh sáng nền |

**Token / chi phí (ước tính):** khoảng 150–200k token cho Phase 1, phần lớn ở bước đọc tài liệu và viết code. _(Cập nhật số thật từ `/cost` hoặc trang usage khi kết thúc phase.)_

**Cách tiết kiệm:**
- Đọc lab board một lần, tóm thành bảng giả định thay vì hỏi lại nhiều lần.
- Không spawn subagent. Giá trị mong đợi tính tay nên không phải chạy thử nhiều vòng.
- Hook và CI tự chạy test, nên không phải nhắc agent kiểm tra lại.

## Phase 2

**Lời nhắc chính:** "Làm tiếp phase 2", kèm dán toàn văn Ticket-02. Agent không đọc được tab Phase 2 (nội dung tải động sau khi đăng nhập; truy cập trực tiếp cơ sở dữ liệu của trang bị chặn) nên đã dừng lại xin người dán ticket, thay vì đoán yêu cầu.

**Cách làm với agent:**
1. Viết `docs/notes/phase-2.md` (bảng luật bị thay, 22 giả định, tiêu chí nghiệm thu) và commit **trước** khi code.
2. Ưu tiên phần chấm tự động: số chuẩn, 3 bản đồ chuẩn, 12 bước/tick, contract v1.1. Web làm sau.
3. Spec headless chuyển sang sinh từ một file (`tests/scenarios/gen-specs.mjs`). Spec Phase 1 được sửa theo số chuẩn kèm trường `changed`.
4. Đo thật: thời gian headless (test CLI), FPS bằng Chrome điều khiển qua puppeteer-core.

**AI sai ở đâu, phát hiện thế nào:**

| Lỗi | Phát hiện | Xử lý |
|---|---|---|
| Chạy `python - \|\| node -e ...`: `python -` chờ stdin nên lệnh treo 2 phút | Lệnh bị timeout | Dừng task, sửa bằng Edit. Thêm quy tắc vào AGENTS.md |
| Spec P2-10 (đi trên cầu) bị lệch 0.2 m: Bùa Gió C1 nằm giữa cầu nên Mây chạy nhanh hơn | `npm run verify` FAIL | Bỏ bùa khỏi scenario đó. Thêm vào AGENTS.md và skill: "kiểm tra tác dụng phụ của bản đồ trước khi viết spec" |
| Spec P2-10 ban đầu cho Mây đi ngang ở x = 44, nơi đã là đảo B nên không rơi | Tự rà trước khi chạy | Đổi điểm rẽ sang x = 35 |
| Spec P1-04 đặt đom đóm ở 1.1 m: 1.1 − 0.1 có thể > 1.0 do sai số dấu phẩy động | Tự rà trước khi chạy | Đổi thành 1.05 |
| Unit test "re-pulse" viết lẫn lộn, không kiểm tra đúng điều tên test nói, và đếm thiếu 1 tick | Tự đọc lại | Viết lại: shade đang choáng 30 tick, trúng lại thì về 120 |
| Tiếng nhảy có hàm nhưng không được gọi (sim không có event nhảy) | Rà bảng nghiệm thu | Bản web tự nhận ra lúc nhảy, không đổi headless |

**Token / chi phí (ước tính):** khoảng 250–300k token cho Phase 2 (ticket dài, viết lại sim và web). _(Cập nhật số thật từ `/cost`.)_

**Cách tiết kiệm:** viết giả định một lần rồi code theo; giá trị mong đợi tính tay nên ít vòng sửa; dồn kiểm tra vào `npm run verify` (một lệnh cho 35 scenario); không dùng subagent.

## Phase 3

**Lời nhắc chính:** "Tiếp tục với p3", kèm dán Ticket-03. Người dùng yêu cầu lưu lại thay đổi của từng phiên bản → CHANGELOG.md có bảng phiên bản/commit và danh sách breaking change từng phase.

**Cách làm:** viết ADR-003 và CHANGELOG trước; lưu dầu bằng số nguyên 1/60; chạy lại spec cũ để thấy chính xác 6 spec bị luật mới thay, sửa từng cái kèm `changed`.

| Lỗi của AI | Phát hiện | Xử lý |
|---|---|---|
| Chèn `// comment` vào giữa một dòng object trong test CLI, làm mất các trường phía sau | Test đỏ | Dùng `/* */` |
| Thanh dầu dạng mặt phẳng + lookAt không hiện | Xem ảnh chụp | Đổi sang Sprite; lần đầu lệch nửa → tính lại tâm |
| Ảnh Đêm 3 trống | Xem ảnh | Chụp lại (khung đầu chưa vẽ) |
| Lệnh `node -e "..."` chứa backtick trong bash bị shell hiểu sai | Lỗi cú pháp, không file nào bị ghi | Ghi file bằng công cụ sửa file |

**Token (ước tính):** ~120–150k cho Phase 3. _(Cập nhật số thật từ `/cost`.)_

## Phase 4

**Lời nhắc chính:** dán Ticket-04 "Bình minh: phát hành v1.0.0" kèm "Làm tiếp ph4 cho xong đi". Ràng buộc người dùng đặt từ trước: không push, không gắn tag (người tự gắn). Model: Claude Sonnet 4.6 phần đầu, Claude Opus 5.5 phần cuối (sau khi nén ngữ cảnh).

**Cách làm:** viết ADR-004 và 12 giả định trong `docs/notes/phase-4.md` trước khi code. Soak chạy thuần Node (dùng lại `Sim`), bench chạy trong Chrome thật vì cần đo render. Mọi thứ thêm vào chỉ ở `src/web/`, `scripts/` và cờ `--soak` nên output headless không đổi. Kiểm thử UI bằng script puppeteer tạm (đổi phím, trùng phím, khôi phục, chữ lớn, nhập tên sai/đúng, bảng xếp hạng, POST xấu bị từ chối 400) rồi xem ảnh chụp.

| Lỗi của AI | Phát hiện | Xử lý |
|---|---|---|
| p95 tính trên mảng sắp giảm dần nên thực ra là p5 (ra 0.4 ms) | Con số vô lý với cảnh 200 Bóng Mực | Lấy phần tử ở 5% đầu mảng giảm dần |
| Bench.mjs gọi `page.metrics()` và `waitForFunction` liên tục qua CDP, làm khựng khung hình, kéo 1% low xuống ~19 | Kết quả dao động mạnh, 1% low tăng khi giãn nhịp poll | Chờ và đo heap ngay trong trang, không gọi CDP khi đang đo |
| Bỏ `preserveDrawingBuffer` để tăng FPS làm ảnh chụp headless bị trống | Xem lại ảnh `night1-hud` | Giữ lại; bench đo đúng cấu hình người chơi dùng |
| Trùng phím: thiết kế đầu ghi đè nên hai hành động dùng chung phím | Script kiểm thử in ra bindings sau khi gán | Đổi sang đổi chỗ phím, cập nhật D8 |
| Cờ chữ lớn đặt `font-size` cho `:root` nhưng CSS dùng px nên không có tác dụng | Đọc lại CSS | Dùng class `body.large` + `zoom: 1.25` |
| Gõ một lệnh bash có `cat > file` không có input nên treo 2 phút (lặp lại lỗi Phase 2 dù AGENTS.md đã cấm) | Lệnh bị timeout | Dừng task. Bài học: quy tắc trong AGENTS.md chưa đủ, cần hook chặn lệnh chờ stdin |
| Tắt server cũ bằng TaskStop nhưng tiến trình node con vẫn giữ cổng 5173 | `EADDRINUSE` khi khởi động lại | Tìm PID theo cổng rồi dừng đúng tiến trình đó |
| README còn mô tả luật Phase 2 (thắng khi thắp hết đèn, điểm cũ) suốt Phase 3 | Rà README khi thêm mục Phase 4 | Viết lại theo luật Phase 3, kiểm tra luật hút dầu trong `sim.ts` trước khi ghi |
| **`bench.json` và `soak.json` chưa từng được commit**: dòng `bench.json` trong `.gitignore` chặn file ở mọi thư mục, kể cả `docs/proof/phase-4/` | Rà lại ticket từng dòng sau khi "xong"; `git status` không hiện hai file dù vừa sinh lại | Neo luật ignore về gốc (`/bench.json`, `/soak.json`) |
| Bench ẩn Mây, trong khi ticket ghi "Mây đứng yên tại (0,0,0)" | Rà lại ticket | Hiện Mây ở (0,0,0) |
| `peak_mem_mb` ghi JS heap, trong khi ticket định nghĩa là RSS (cho phép `null` với web) | Rà lại ticket | Ghi `null`, JS heap chuyển sang `js_heap_peak_mb`, giải thích ở README |
| Soak đo `mem_start` sau khi Đêm 1 **kết thúc** (ticket: sau khi **tải xong**), thiếu `duration_s` | Rà lại ticket | Đo đúng chỗ, thêm `duration_s`. Đo đúng thì +28% (V8 nở một lần, heap thật đứng yên) → soak_cmd thêm `--no-opt --max-semi-space-size=1`, có số đo chứng minh không rò rỉ |
| Điểm bảng xếp hạng khi thua cộng cả Đêm đang thua (ticket: tổng điểm các Đêm đã thắng) | Rà lại ticket | Chỉ cộng các Đêm đã thắng |
| Gió sắp thổi và 10 s cuối chỉ có âm thanh, chưa có chỉ báo hình ảnh như ticket yêu cầu | Rà lại ticket | Thêm dòng phụ đề cho gió, 10 s cuối, Bóng Mực xuất hiện, đèn sắp cạn dầu |

**Bài học lớn nhất của Phase 4:** lần đầu báo "xong" dựa trên bản tóm tắt yêu cầu tự viết, không đọc lại nguyên văn ticket. Rà lại từng dòng tìm ra 6 chỗ lệch, trong đó một chỗ (bằng chứng không được commit) làm trượt DoD.

**Token (ước tính):** ~250–300k cho Phase 4 (gồm phần thiết kế lại nhân vật/môi trường trước đó và một lần nén ngữ cảnh). _(Cập nhật số thật từ `/cost`.)_

**Cách tiết kiệm:** kiểm thử UI bằng một script chạy một lần thay vì nhiều lần chụp ảnh lẻ; chạy bench 10–15 s khi dò lỗi, chỉ chạy bản 30 s cho bằng chứng; không dùng subagent.
