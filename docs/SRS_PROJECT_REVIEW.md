# Review SRS so voi project thuc

Nguon SRS da doc: `SRS/SRS.docx`  
Pham vi doi chieu: code hien tai trong `backend/`, `frontend/`, `vision-engine/`, `README.md`, `docker-compose.vision.yml` va cac ghi chu trong `docs/`.

## Ket luan nhanh

SRS hien tai da bam kha sat project that: co mo ta kien truc React/TypeScript, Spring Boot, PostgreSQL/PGVector, vision-engine FastAPI/OpenCLIP, cac vai tro Customer/Vendor/Admin, use case, activity, sequence, class/database diagram, tu dien du lieu, NFR va bang mapping chuc nang - UI - API - DB.

Tuy nhien chua nen xem la hoan thien de nop ngay. Can sua them cac muc duoi day, uu tien theo thu tu.

## Can sua bat buoc

### 1. Hoan thien Chuong 4 bang anh UI that

Trong `SRS.docx`, Chuong 4 van con 19 dong `[Chen anh UI tai day]`, tu nhom Customer den Vendor va Admin. Cac caption Hinh 4.1 den Hinh 4.19 da co, nhung chua co anh minh chung that.

Nen thay cac placeholder bang screenshot tu app that:

- Customer: Home, ProductListing, ProductDetail, Image Search, Cart, Checkout, PaymentResult, OrderTracking, Chatbot.
- Vendor: Dashboard, Products, Product form/variants, Orders, Finance/Voucher.
- Admin: Dashboard, Users/Stores, Product moderation, Bot scenario, Image Vision dashboard.

Sau khi chen anh, can cap nhat lai muc luc, danh muc hinh, danh muc bang va so trang trong Word.

### 2. Bo sung tich hop van chuyen GHN

SRS hien tai gan nhu chua nhac den GHN, trong khi project co tich hop that:

- Backend co `GhnController` voi `/api/shipping/ghn/provinces`, `/districts`, `/wards`, `/calculate-fee`.
- Checkout frontend tinh phi ship dong qua `/api/shipping/ghn/calculate-fee`.
- Security config public route `/api/shipping/ghn/**`.
- Store/Address luu cac truong GHN nhu province/district/ward va cau hinh ship cua cua hang.

Nen them mot muc trong SRS:

- `2.1.4. Dich vu tich hop`: them GHN shipping.
- `3.2`: them giai phap tinh phi van chuyen dong.
- `3.3.7`: them mapping GHN vao bang doi chieu.
- `Chuong 4`: chen hoac mo ta screenshot checkout co tinh phi van chuyen.
- NFR: them fallback shipping fee khi GHN loi.

### 3. Lam ro Wishlist dang la frontend state, chua phai luong API hoan chinh

SRS da co `Wishlist` trong tu dien du lieu va bang mapping, nhung code hien tai cho thay wishlist UI chu yeu nam trong `WishlistContext` o frontend. Backend co entity/repository `Wishlist`, nhung khong thay controller/service API wishlist rieng.

Nen chon mot trong hai cach ghi SRS:

- Neu khong sua code: ghi ro wishlist hien tai la chuc nang giao dien/phien nguoi dung, chua phai tinh nang persisted API day du.
- Neu muon claim day du: can co them API/backend service cho wishlist truoc khi mo ta nhu chuc nang database hoan chinh.

### 4. Mo ta thong bao realtime ro hon

Project co notification that:

- `NotificationController` cho list, unread count, mark read, delete.
- `WebSocketConfig` cau hinh STOMP/SockJS `/ws`, `/user/queue/notifications`.
- Frontend co `NotificationProvider`, `notificationApiService`, `notificationSocketService`, toast stack va tab thong bao trong Profile.
- Co `PromotionNotificationEvent` va `PromotionNotificationDispatch` cho thong bao khuyen mai.

SRS da nhac den notification trong mapping/data dictionary, nhung nen them:

- Use case hoac sub-use case "Nhan va quan ly thong bao".
- Sequence ngan cho realtime notification.
- Anh UI notification dropdown/toast/Profile notifications neu demo.

### 5. Bo sung Flash Sale / promotion vao phan ket qua va diagram neu dua vao demo

Code co `FlashSaleCampaign`, `FlashSaleItem`, `FlashSaleSection`, route search `flashSale=1`, va logic order ap dung flash sale. SRS hien chi de flash sale nhu muc phu.

Nen bo sung:

- Mo ta flash sale trong nhom Customer/Home/Search.
- Tac dong den Order/OrderItem: flashSaleItemId, flashSaleUnitPrice, quota.
- Anh UI Flash Sale neu co demo.
- Cap nhat Class Diagram/Database Diagram neu diagram hien chua co `FlashSaleCampaign` va `FlashSaleItem`.

### 6. Mo ta tai chinh/hoa hong/payout sau hon

Project co kha nhieu logic tai chinh:

- `WalletController`: wallet, transaction, payout request, approve/reject payout.
- `AdminFinancialSettingsController`, `CommissionTierController`.
- Frontend co `VendorFinance`, admin financial panels, commission service.
- Entities: `VendorWallet`, `CustomerWallet`, `WalletTransaction`, `PayoutRequest`, `CommissionTier`, `PlatformSetting`.

SRS da co mapping, nhung nen them ro:

- Use case Vendor yeu cau rut tien.
- Use case Admin duyet/tu choi payout.
- NFR ve toan ven giao dich vi/hoa hong.
- Screenshot Vendor Finance va Admin Financials.

### 7. Chot pham vi ContentPage/AdminContent

Backend co `ContentPageController` va entity `ContentPage`. Frontend co file `AdminContent.tsx`, nhung route `AdminWorkspace` hien tai chua thay route content ro rang.

Nen sua SRS theo dung scope demo:

- Neu content page khong demo: de vao "huong phat trien" hoac "module phu".
- Neu demo: them route/menu/screenshot Admin Content va mo ta API `/api/admin/content`.

### 8. Them bang endpoint/API chinh xac

Bang mapping hien dung ten controller/module, nhung SRS se chat hon neu co phu luc endpoint matrix cho cac API chinh:

- Auth: `/api/auth/register`, `/login`, `/forgot-password`, `/reset-password`.
- Marketplace public: `/api/public/marketplace/home`, `/search/products`, `/search/image`, `/flash-sale/active`.
- Shipping GHN: `/api/shipping/ghn/*`.
- Payment: `/api/payments/vnpay/*`, `/api/payments/momo/*`.
- Vision admin/internal: `/api/admin/vision/*`, `/api/internal/vision/catalog`.
- Notification: `/api/notifications/me`, `/me/unread-count`, `/{id}/read`.

## Nen sua de SRS thuyet phuc hon

### 9. Bien phan kiem thu thanh bang ket qua co bang chung

Chuong 4 hien noi repository co lenh test/build/smoke, nhung chua co bang ket qua chay. Nen them bang:

| Hang muc | Lenh | Ket qua | Ngay chay | Ghi chu |
|---|---|---|---|---|
| Backend test | `backend\mvnw.cmd -f backend/pom.xml test` | Pass/Fail | | |
| Frontend build | `npm.cmd run build --prefix frontend` | Pass/Fail | | |
| Vision tests | `vision-engine\.venv\Scripts\python.exe -m unittest ...` | Pass/Fail | | |
| Smoke frontend | `npm.cmd run smoke --prefix frontend` | Pass/Fail | | |

Khong nen chi ghi "co the chay" neu chua co bang chung.

### 10. Cap nhat diagram theo entity phu

Tu dien du lieu trong SRS da bao phu nhieu entity, nhung diagram can dam bao khong thieu cac bang/thuc the co gia tri nghiep vu:

- `Wishlist`, `StoreFollow`
- `Notification`, `PromotionNotificationEvent`, `PromotionNotificationDispatch`
- `FlashSaleCampaign`, `FlashSaleItem`
- `VendorWallet`, `CustomerWallet`, `WalletTransaction`, `PayoutRequest`
- `CommissionTier`, `PlatformSetting`
- `ContentPage`
- `VisionSyncRun`, `VisionSyncFailure`
- `InventoryLedger`, `LoyaltyPoint`

Neu diagram qua day, co the tach thanh "Core Marketplace ERD" va "Operations/Extensions ERD" thay vi nhoi tat ca vao mot hinh.

### 11. Lam NFR do duoc hon

NFR hien dung huong, nhung nen them chi so cu the neu co the:

- Gioi han upload anh: dung luong, dinh dang, pixel toi da.
- Image search: rate limit, timeout, fallback khi vision-engine down.
- Security: JWT expiration/refresh, CORS domain, Swagger chi Admin.
- Performance: pagination size, muc tieu latency cho search/list.
- Backup/rollback: tan suat backup, dieu kien rollback.

### 12. Chuan hoa claim "da hoan thien"

Mot so module trong code da co nhung muc do hoan thien khac nhau. SRS nen tach:

- "Da hien thuc va demo chinh": auth, product, cart, checkout/order, payment sandbox, vendor/admin workspace, image search, chatbot.
- "Da co trong code/can minh chung them": notification, flash sale, finance/payout, content page, GHN, wishlist persistence.
- "Huong phat trien": load test, inventory concurrency, production monitoring, chatbot fallback nang cao.

## Cac diem da khop tot voi project

- Kien truc 3 service trong README: backend Spring Boot, frontend React/Vite, vision-engine FastAPI/OpenCLIP.
- Stack chinh trong SRS khop voi `pom.xml`, `frontend/package.json`, `vision-engine/requirements.txt`.
- Routes frontend Customer/Admin/Vendor khop voi `App.tsx`, `AdminWorkspace.tsx`, `VendorWorkspace.tsx`.
- Backend controller/entity coverage khop phan lon voi bang mapping va tu dien du lieu.
- Vision-engine duoc mo ta dung: OpenCLIP, pgvector, sync catalog, metrics, health/readiness, validation anh.
- Chuc nang thanh toan VNPay/MoMo, chatbot, image search, return/refund, voucher, wallet da co nen giu trong SRS.

## Luu y ve QA DOCX

Da thu render `SRS/SRS.docx` sang PNG theo workflow review DOCX, nhung may hien tai khong tim thay executable chuyen DOCX sang PDF (`soffice`/LibreOffice), nen chua xac minh duoc layout bang anh render. Review nay dua tren trich xuat noi dung DOCX va doi chieu code.

Truoc khi nop, nen mo file bang Word va kiem tra thu cong:

- Placeholder Chuong 4 da duoc thay het.
- Caption khong tach khoi anh.
- Bang 3.27/3.28 khong tran le.
- Muc luc, danh muc hinh, danh muc bang da update.
- Font/line spacing/le trang dung rule format.

## De xuat thu tu sua

1. Chen 19 anh UI that vao Chuong 4.
2. Bo sung GHN shipping vao SRS.
3. Chinh wishlist theo dung hien thuc frontend/backend.
4. Bo sung notification realtime va flash sale neu demo.
5. Cap nhat finance/payout/commission trong use case, diagram, Chuong 4.
6. Them bang ket qua test/build/smoke.
7. Cap nhat diagram va muc luc/danh muc lan cuoi.
