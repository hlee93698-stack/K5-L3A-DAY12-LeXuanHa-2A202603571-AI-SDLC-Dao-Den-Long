# Retro: Đảo Đèn Lồng v1.0.0

Nhìn lại cả 4 phase làm cùng Claude Code. Chi tiết từng lỗi ở [ai-log.md](ai-log.md), giả định từng phase ở `phase-N.md`.

## Số liệu

| | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|
| Contract | 1.0 | 1.1 | 1.2 | 1.3 |
| Scenario headless (tích lũy) | 16 | 35 | 42 | 42 (không đổi luật) |
| Test unit + CLI + scenario | — | — | 79 | 80 |
| Spec cũ bị luật mới thay (có `changed`) | — | 16 (số chuẩn) | 6 | 0 |
| Lỗi AI ghi trong nhật ký | 6 | 6 | 4 | 8 |
| Token ước tính | 150–200k | 250–300k | 120–150k | 250–300k |

Hiệu năng cuối: một Đêm đầy đủ chạy headless ~0.2–0.7 s (ngưỡng 30 s). Bench 1280×720: avg 115 FPS, 1% low 65, load 1.2 s. Soak 10 Đêm: 0 crash, RAM +3.6%.

## Điều hiệu quả

- **Tách lõi mô phỏng thuần, tất định khỏi phần hiển thị ngay từ Phase 1.** Ba lần đổi luật (Phase 2, 3) chỉ chạm `src/sim/`; phần sáng tạo, thiết kế lại nhân vật và cả Phase 4 chỉ chạm `src/web/` mà không làm đổi một byte output headless. Đây là quyết định đáng giá nhất.
- **Giả định viết trước, code sau.** Mỗi phase có bảng giả định trước khi code; khi test ẩn khác cách hiểu, biết ngay chỗ nào cần xem lại.
- **Giá trị mong đợi tính tay.** Bắt được vài lỗi trước khi chạy (thứ tự bước nhặt/nạp, sai số dấu phẩy động 1.1 − 0.1).
- **Harness tự chạy:** hook Stop chặn khi `npm test` đỏ, hook chặn sửa tay `docs/proof/**`, `npm run verify` sinh bằng chứng một lệnh, CI so bằng chứng với git. Nhờ vậy không phải nhắc agent kiểm tra lại và bằng chứng không thể "đẹp hơn thực tế".
- **Xem ảnh chụp thật.** Nhiều lỗi chỉ nhìn mới thấy (cảnh tối, thanh dầu lệch, ảnh trống khi bỏ `preserveDrawingBuffer`).

## Điều chưa hiệu quả

- **Quy tắc trong AGENTS.md không đủ để chặn lỗi lặp lại.** Lệnh chờ stdin làm treo shell ở Phase 2, đã ghi quy tắc cấm, vẫn lặp lại ở Phase 4. Quy tắc dạng chữ phụ thuộc vào việc agent nhớ; hook thì không.
- **Tài liệu người đọc bị trễ so với code.** README mô tả luật Phase 2 suốt Phase 3 mà không test nào bắt được.
- **Đo hiệu năng trên laptop dao động mạnh** (một lần 38 FPS, các lần sau 103–115). Số liệu chỉ tin được khi chạy nhiều lần và ghi rõ máy, trạng thái nguồn.
- **Công cụ đo có thể làm sai số đo.** Poll trang qua CDP làm khựng khung hình; p95 tính nhầm thành p5. Cả hai đều cho ra số "đẹp" hoặc "xấu" giả, chỉ phát hiện vì con số vô lý.

## Harness giúp nhiều nhất

1. `npm run verify` + hook chặn sửa `docs/proof/**` + CI diff: bằng chứng luôn là output thật.
2. Hook Stop chặn khi test đỏ: không có lượt nào kết thúc với test hỏng.
3. Spec sinh từ `gen-specs.mjs` với trường `changed`: đổi luật không bao giờ "lặng lẽ" bỏ test cũ.

## Nếu làm lại

- Thêm **hook PreToolUse chặn lệnh chờ stdin** (`python -`, `cat >` không có heredoc, `node -` không có input) thay vì chỉ ghi trong AGENTS.md.
- Thêm **test kiểm tra README** khớp `tuning` (thời lượng Đêm, bảng điểm) để tài liệu không trễ so với luật.
- Viết **bench và soak ngay từ Phase 2**, khi lần đầu có yêu cầu FPS, thay vì `bench-fps.mjs` tạm rồi viết lại ở Phase 4.
- Với số đo hiệu năng: chạy ít nhất 3 lần, ghi trung vị, và tự kiểm tra con số có hợp lý không (p95 phải ≥ thời gian khung trung bình) trước khi tin.
