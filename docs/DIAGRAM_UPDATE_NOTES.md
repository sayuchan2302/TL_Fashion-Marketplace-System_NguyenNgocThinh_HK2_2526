# Diagram Update Notes

## Mục tiêu

Kiểm tra và cập nhật Class Diagram/Database Diagram để khớp hơn với code thật trước bản nộp cuối.

## Entity/chức năng nên kiểm tra trong Class Diagram

Nhóm tài khoản và phân quyền:
- User
- Address
- PasswordResetToken
- AdminAuditLog

Nhóm cửa hàng:
- Store
- StoreFollow

Nhóm sản phẩm:
- Product
- ProductImage
- ProductVariant
- Category
- ProductAuditLog
- ProductReport
- InventoryLedger
- Wishlist

Nhóm đơn hàng và hoàn trả:
- Cart
- CartItem
- Order
- OrderItem
- OrderStatusLog
- ReturnRequest
- Review

Nhóm voucher/khuyến mãi:
- Voucher
- Coupon
- CustomerVoucher
- FlashSaleCampaign
- FlashSaleItem
- PromotionNotificationEvent
- PromotionNotificationDispatch

Nhóm tài chính:
- CustomerWallet
- VendorWallet
- WalletTransaction
- CustomerWalletTransaction
- PayoutRequest
- CommissionTier
- PlatformSetting/AdminFinancialSettings

Nhóm chatbot/nội dung:
- BotScenarioRevision
- ContentPage

Nhóm notification:
- Notification

Nhóm vision/image search:
- VisionSyncRun
- VisionSyncFailure
- Bảng embedding thuộc schema vision hoặc bảng lưu vector ảnh sản phẩm nếu có.

## Đề xuất refactor Class Diagram

- Chia thành các cụm trực quan: Identity, Store, Product, Order, Payment/Wallet, Promotion, Support, Vision.
- Không cố nhồi toàn bộ thuộc tính chi tiết vào từng class; chỉ giữ các thuộc tính chính và quan hệ quan trọng.
- Với entity phụ như PromotionNotificationEvent hoặc InventoryLedger, có thể đặt vào cụm phụ để tránh sơ đồ rối.
- Đảm bảo mũi tên quan hệ không đè chữ và không giao nhau quá nhiều.

## Đề xuất refactor Database Diagram

- Nếu sơ đồ hiện tại chưa có các bảng tài chính, notification, flash sale, content page và vision sync thì nên bổ sung.
- Nên dùng màu/khung nhóm hoặc khoảng cách để tách các domain dữ liệu.
- Với bảng nhiều cột, chỉ hiển thị khóa chính, khóa ngoại và các trường nghiệp vụ quan trọng trong diagram chính; đưa chi tiết vào từ điển dữ liệu.

## Ưu tiên cập nhật

1. Bổ sung Wishlist, StoreFollow, Notification.
2. Bổ sung WalletTransaction/PayoutRequest/CommissionTier/AdminFinancialSettings.
3. Bổ sung FlashSaleCampaign/FlashSaleItem nếu UI demo có flash sale.
4. Bổ sung VisionSyncRun/VisionSyncFailure và bảng embedding nếu image search là điểm nhấn.
5. Kiểm tra lại mối quan hệ Order - OrderItem - ProductVariant - Store - Payment/WalletTransaction - ReturnRequest.
