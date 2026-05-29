# SRS Code Audit - Fashion Marketplace

## Phạm vi rà soát

Nguồn tham chiếu: repository `sayuchan2302/TL_Fashion-Marketplace-System_NguyenNgocThinh_HK2_2526` và file `SRS_formatted(1).docx`.

Do môi trường container không truy cập được GitHub bằng `git clone`, phần rà soát mã nguồn được thực hiện qua trang GitHub public và cấu trúc thư mục/tệp hiển thị trên web. Các kết luận dưới đây được dùng để nâng cấp SRS theo hướng bám sát code thật, nhưng những chi tiết endpoint nội bộ cần được xác minh lại khi mở trực tiếp IDE hoặc Codex workspace.

## Kiến trúc repo quan sát được

- `backend/`: Spring Boot API và business logic.
- `frontend/`: React + TypeScript + Vite web client.
- `vision-engine/`: FastAPI OpenCLIP image-search service.
- `docs/`: smoke-test và project notes.
- `docker-compose.vision.yml`: chạy service vision-engine.

README mô tả project là marketplace thời trang full-stack với Spring Boot, React, PostgreSQL và OpenCLIP image search; có thể triển khai thành ba service: backend API, frontend web app và vision-engine.

## Backend - module/controller quan trọng

Các controller quan sát được:

- AuthController
- AddressController
- UserProfileController
- ProductController
- MarketplacePublicController
- CartController
- OrderController
- VendorOrderController
- ReturnRequestController
- ReviewController
- StoreController
- CategoryController
- VoucherController
- WalletController
- VNPayController
- MoMoController
- GhnController
- NotificationController
- AdminUserController
- AdminProductController
- AdminOrderController
- AdminDashboardController
- AdminReportController
- AdminBotScenarioController
- AdminVisionController
- AdminFinancialSettingsController
- CommissionTierController
- ContentPageController
- InternalVisionController
- BotController
- BotTokenController

Nhận xét: SRS hiện đã mô tả khá tốt các module chính như authentication, product, cart, order, payment, return, review, voucher, wallet, chatbot và image search. Tuy nhiên cần nhấn mạnh thêm các module có trong code nhưng SRS chưa làm nổi bật: notification, content page, commission tier, admin financial settings, GHN/shipping, admin vision vận hành, wishlist/store follow và flash sale/promotion.

## Backend - entity quan trọng

Các entity quan sát được:

- User, Address, Store, StoreFollow
- Product, ProductImage, ProductVariant, Category
- Cart, CartItem
- Order, OrderItem, OrderStatusLog
- Review, ReturnRequest, ProductReport, ProductAuditLog
- Voucher, Coupon, CustomerVoucher
- CustomerWallet, VendorWallet, WalletTransaction, CustomerWalletTransaction, PayoutRequest
- CommissionTier, PlatformSetting, AdminAuditLog
- Notification, PromotionNotificationEvent, PromotionNotificationDispatch
- FlashSaleCampaign, FlashSaleItem
- ContentPage
- PasswordResetToken
- InventoryLedger
- LoyaltyPoint
- BotScenarioRevision
- VisionSyncRun, VisionSyncFailure
- Wishlist

Nhận xét: Class Diagram và Database Diagram nên kiểm tra lại để bảo đảm các entity phụ nhưng có giá trị nghiệp vụ không bị thiếu, đặc biệt là Wishlist, StoreFollow, Notification, FlashSaleCampaign, FlashSaleItem, PayoutRequest, CommissionTier, PlatformSetting/AdminFinancialSettings, ContentPage, VisionSyncRun và VisionSyncFailure.

## Frontend - pages/routes quan trọng

Các pages/routes quan sát được:

- `/`: Home
- `/category/:id`: ProductListing
- `/product/:id`: ProductDetail
- `/cart`: Cart
- `/checkout`: Checkout
- `/login`, `/register`, `/forgot`, `/reset-password`: Auth
- `/vendor/register`: VendorRegister
- `/order-success`: OrderSuccess
- `/search`: Search
- `/wishlist`: Wishlist
- `/order-tracking`: OrderTracking
- `/returns`: Returns
- `/payment-result`: PaymentResult
- `/faq`, `/size-guide`, `/policy/:type`, `/about`, `/contact`
- `/store/:slug`: StoreProfile
- `/profile`, `/profile/orders/:id`, `/account/orders`, `/account/addresses`, `/account/security`
- `/admin/*`: AdminWorkspace, protected for `SUPER_ADMIN`
- `/vendor/*`: VendorWorkspace, protected for `VENDOR` and vendor approval

Nhận xét: SRS nên dùng Chương 4 để chứng minh các giao diện này bằng ảnh UI thật. Các phần chưa nên bỏ qua: wishlist, store profile/follow, account addresses/security, payment result, admin workspace, vendor workspace, admin vision.

## Frontend - services quan trọng

Các service quan sát được:

- authService, profileService, addressService
- productService, searchService, marketplaceService
- orderService, returnService, reviewService
- storeService, storeFollowService
- walletService
- couponService, customerVoucherService, vendorVoucherService, adminPromotionService
- adminDashboardService, adminUserService, adminFinancialSettingsService, adminBotScenarioService, adminVisionService
- notificationApiService, notificationService, notificationSocketService
- chatbotService
- commissionService
- vendorPortalService, vendorProductService
- vnpayCheckoutStore

Nhận xét: Các service này là cơ sở cho bảng mapping chức năng - UI - API/module - DB đã được thêm vào SRS.

## Vision-engine

README mô tả vision-engine là service FastAPI dùng OpenCLIP + pgvector, có các endpoint/khả năng vận hành như health, readiness, search image, admin catalog sync, metrics, sync history và rate limit cho public image search. SRS hiện đã mô tả khá tốt OpenCLIP/PGVector, nhưng Chương 4 cần bổ sung kết quả vận hành và UI Admin Image Vision dashboard/sync history.

## Điểm SRS đã tốt

- Cấu trúc chương rõ, gần với mẫu giáo viên.
- Có use case, activity diagram, sequence diagram, class diagram, database diagram và từ điển dữ liệu.
- Phần chatbot và OpenCLIP/PGVector đã mô tả tương đối kỹ.
- Các vai trò Customer, Vendor, Admin đã được mô hình hóa.

## Điểm đã nâng cấp trong bản mới

- Bổ sung mục yêu cầu phi chức năng 3.1.3.
- Bổ sung bảng mapping chức năng - UI - API/module - DB.
- Viết lại mục các vấn đề gặp phải và giải pháp theo hướng kỹ thuật cụ thể hơn.
- Viết lại Chương 4 thành phần kết quả có cấu trúc rõ, có placeholder để chèn ảnh UI sau.
- Cập nhật tài liệu tham khảo, bỏ nguồn local `D:\Project\...`.
- Tạo checklist ảnh UI và ghi chú cập nhật diagram.

## Phần cần xác minh thêm khi mở IDE/Codex

- Tên endpoint chính xác của từng API trong controller.
- Tên component cụ thể trong AdminWorkspace và VendorWorkspace.
- Tên bảng thực tế nếu JPA đặt tên khác entity.
- Khả năng hiện có của GHN/shipping trong UI demo.
- Trạng thái hoàn thiện của flash sale, loyalty point, content page và notification trong giao diện.
