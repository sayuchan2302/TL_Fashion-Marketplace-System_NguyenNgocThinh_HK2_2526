# Quy tắc Viết Đặc tả Use Case trong tài liệu SRS

Tài liệu `SRS_upgraded.docx` tuân thủ các quy tắc định dạng bảng đặc tả Use Case cụ thể như sau:

## 1. Cấu trúc và Định dạng của Bảng
Bảng đặc tả Use Case sử dụng cấu trúc **bảng 2 cột** và được chia thành **5 phần chính** với các hàng ngăn cách (Sub-header rows):

### 1.1. Phần Thông tin Chung
Nằm ở đầu bảng để định nghĩa các thuộc tính cơ bản:
- **Hàng 1 (`Name`)**: Tên đầy đủ của Use Case (Danh từ/Động từ, viết thường, ví dụ: `Quản lý sản phẩm`).
- **Hàng 2 (`Brief Description`)**: Mô tả ngắn gọn mục tiêu của chức năng (1-3 câu, nêu rõ ai làm gì và để làm gì).
- **Hàng 3 (`Actor(s)`)**: Các tác nhân kích hoạt hoặc tương tác (ví dụ: `Vendor`, `Admin`, `Customer`, `Hệ thống ví`).

### 1.2. Luồng xử lý chính (Basic Flow)
Mô tả kịch bản lý tưởng nhất khi tính năng hoạt động không gặp lỗi:
- Gồm hai hàng tiêu đề phụ được gộp (merge) cả hai cột: Hàng thứ nhất ghi `Flow of Events`, hàng thứ hai ghi `Basic Flow`.
- Hàng nội dung kế tiếp cũng được gộp cột, mô tả các bước theo thứ tự số tự nhiên (`1.`, `2.`, `3.`...):
  - **Bắt đầu**: Luôn bắt đầu bằng câu `"Use case bắt đầu khi [Tác nhân] muốn..."`.
  - **Mô tả**: Từng bước tương tác rõ ràng giữa Người dùng (front-end) và Hệ thống (back-end), bao gồm cả địa chỉ API nếu có (ví dụ: *"Front-end gửi yêu cầu POST đến API /api/products"*).
  - **Kết thúc**: Bước cuối cùng luôn là `"Kết thúc use case."`.

### 1.3. Luồng rẽ nhánh/thay thế (Alternate Flows)
Mô tả các kịch bản ngoại lệ, lỗi nhập liệu hoặc lỗi hệ thống:
- Bắt đầu bằng hàng tiêu đề phụ gộp cột ghi `Alternate Flows`, theo sau là hàng tiêu đề cột: **Cột 1** là `Title`, **Cột 2** là `Description`.
- Các hàng nội dung:
  - **Cột 1 (`Title`)**: Tên lỗi hoặc tình huống rẽ nhánh (ví dụ: `Thiếu thông tin sản phẩm`, `Mã SKU bị trùng`).
  - **Cột 2 (`Description`)**: Phải chỉ ra điểm rẽ nhánh cụ thể từ luồng chính bằng cú pháp: `"Tại bước X, nếu [điều kiện lỗi]..."`, sau đó liệt kê các bước xử lý phụ (đánh số `X.1`, `X.2`...) và bước quay lại luồng chính (ví dụ: *"Tiếp tục bước Y của Basic Flow"*).

### 1.4. Điều kiện tiên quyết (Pre-Conditions)
Những điều kiện phải thỏa mãn trước khi Use Case bắt đầu:
- Bắt đầu bằng hàng tiêu đề phụ gộp cột ghi `Pre-Conditions`, theo sau là hàng tiêu đề cột: `Title` và `Description`.
- Ví dụ:
  - `Vendor đã đăng nhập` : `Vendor có phiên đăng nhập hợp lệ để truy cập khu vực quản lý.`
  - `Sản phẩm thuộc quyền sở hữu` : `Sản phẩm phải thuộc cửa hàng đang thao tác.`

### 1.5. Điều kiện sau khi hoàn thành (Post-Conditions)
Mô tả trạng thái của hệ thống sau khi Use Case kết thúc:
- Bắt đầu bằng hàng tiêu đề phụ gộp cột ghi `Post-Conditions`, theo sau là hàng tiêu đề cột: `Title` và `Description`.
- Thường được chia thành hai trường hợp rõ rệt:
  - `Thành công` : Mô tả các thay đổi về mặt dữ liệu trong database và hiển thị ở client.
  - `Thất bại` : Hệ thống hiển thị lỗi, dữ liệu được giữ nguyên trạng thái cũ trước khi thao tác.

---

## 2. Quy tắc hành văn (Style Guidelines)
1. **Chỉ rõ Vai trò Công nghệ**: Tránh viết mơ hồ như *"Hệ thống kiểm tra"*. Hãy viết rõ cấu phần chịu trách nhiệm như **Front-end** (chuẩn hóa dữ liệu đầu vào, validate form) hoặc **Back-end** (xác thực token JWT, lưu cơ sở dữ liệu).
2. **Mapping API rõ ràng**: Đối với các Use Case có tương tác mạng, hãy chỉ định rõ phương thức (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) và danh sách API endpoint tương ứng.
3. **Ràng buộc dữ liệu chi tiết**: Nếu có các ràng buộc dữ liệu cụ thể (như price > 0, stock >= 0, SKU duy nhất), phải đưa chúng vào mô tả ở phần `Pre-conditions` hoặc `Alternate Flows`.
