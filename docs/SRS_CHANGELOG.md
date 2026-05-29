# SRS Change Log

## File đầu ra

- `SRS_upgraded_no_UI.docx`

## Thay đổi chính

1. Bổ sung mục `3.1.3. Yêu cầu phi chức năng`.
   - Thêm bảng NFR gồm bảo mật, phân quyền, toàn vẹn dữ liệu, hiệu năng, upload ảnh, image search, khả dụng, bảo trì, kiểm thử, triển khai và backup/rollback.

2. Bổ sung mục `3.3.7. Bảng đối chiếu chức năng - UI - API - cơ sở dữ liệu`.
   - Tạo bảng mapping giữa chức năng, vai trò, UI liên quan, API/module liên quan, entity/bảng dữ liệu và ghi chú.
   - Mapping dựa trên cấu trúc controller/entity/service/page quan sát được từ repository.

3. Viết lại mục `3.3.8. Các vấn đề gặp phải và giải pháp giải quyết`.
   - Cụ thể hóa các vấn đề kỹ thuật: phân quyền, ownership Vendor, đơn hàng marketplace, tồn kho, callback thanh toán, hoàn trả, image search, chatbot, nhiều service và bảo mật cấu hình.

4. Nâng cấp Chương 4.
   - Chương 4 được viết lại theo cấu trúc:
     - 4.1. Kết quả đạt được
     - 4.1.1. Giao diện Customer
     - 4.1.2. Giao diện Vendor
     - 4.1.3. Giao diện Admin
     - 4.1.4. Thanh toán VNPay/MoMo
     - 4.1.5. Chatbot
     - 4.1.6. Tìm kiếm sản phẩm bằng hình ảnh
     - 4.1.7. Kiểm thử và vận hành
     - 4.2. Đánh giá kết quả
     - 4.3. Kết luận
     - 4.4. Kiến nghị và hướng phát triển
   - Thêm placeholder cho ảnh UI để người dùng chèn ảnh thật sau.

5. Cập nhật tài liệu tham khảo.
   - Thay nguồn local bằng nguồn tham khảo chính thức: GitHub repository, Spring Boot, Spring Security, React, TypeScript, PostgreSQL, PGVector, OpenCLIP, FastAPI, VNPay, MoMo, OWASP.

6. Tạo các file hỗ trợ.
   - `SRS_CODE_AUDIT.md`
   - `SRS_UI_SCREENSHOT_CHECKLIST.md`
   - `DIAGRAM_UPDATE_NOTES.md`
   - `SRS_UPDATE_INSTRUCTIONS.md`

## Lưu ý

- Bản này chưa chèn ảnh UI thật. Các dòng `[Chèn ảnh UI tại đây]` cần được thay bằng ảnh chụp màn hình thực tế.
- Danh mục hình, danh mục bảng, mục lục và số trang trong Word cần được cập nhật sau khi chèn ảnh UI.
- Nếu Class Diagram/Database Diagram hiện tại chưa có các entity phụ, nên refactor sơ đồ trước bản nộp cuối.
