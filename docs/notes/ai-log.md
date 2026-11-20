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
