# LUỒNG TIỀN HỆ THỐNG MARKETPLACE

## 📊 TIMELINE CHÍNH - HAPPY PATH

```
[1] CUSTOMER ĐẶT HÀNG (Order created)
     │
     ├─ Order.status = PENDING
     ├─ Order.paymentStatus = UNPAID
     ├─ Tính sẵn: commissionFee, vendorPayout
     └─ VendorWallet: CHƯA NHẬN TIỀN
     
     ↓
     
[2] CUSTOMER THANH TOÁN (VNPay/MoMo)
     │
     ├─ Order.paymentStatus = PAID
     ├─ Order.paidAt = now
     └─ Tiền vẫn CHƯA vào ví vendor (giữ bởi platform)
     
     ↓
     
[3] VENDOR XÁC NHẬN & XỬ LÝ
     │
     ├─ Order.status: WAITING_FOR_VENDOR → CONFIRMED → PROCESSING
     └─ Vendor đóng gói, tạo vận đơn
     
     ↓
     
[4] GIAO HÀNG
     │
     ├─ Order.status = SHIPPED
     ├─ Có trackingNumber
     └─ Shipper đang giao
     
     ↓
     
[5] CUSTOMER NHẬN HÀNG (Bấm "Đã nhận hàng")
     │
     ├─ Order.status = DELIVERED
     ├─ Order.deliveredAt = now
     ├─ Order.escrowDeadlineAt = now + 7 days
     │
     ├─ ✅ TRIGGER: creditEscrowForCompletedOrder()
     │   └─ VendorWallet.frozenBalance += vendorPayout
     │   └─ Tạo ESCROW_CREDIT transaction
     │
     └─ TIỀN BẮT ĐẦU ESCROW 7 NGÀY
     
     ↓
     
[6] ESCROW 7 NGÀY (Đóng băng)
     │
     ├─ Tiền nằm trong frozenBalance
     ├─ Customer có thể return trong thời gian này
     └─ Vendor CHƯA rút được
     
     ↓
     
[7] ESCROW MATURE (Sau 7 ngày)
     │
     ├─ ✅ TRIGGER: EscrowReleaseScheduler (2AM hàng ngày)
     │   └─ releaseEscrowToAvailable()
     │
     ├─ VendorWallet.frozenBalance -= vendorPayout
     ├─ VendorWallet.availableBalance += vendorPayout
     ├─ Tạo ESCROW_RELEASE transaction
     └─ Order.escrowDeadlineAt = null
     
     ↓
     
[8] VENDOR TẠO PAYOUT REQUEST
     │
     ├─ Vendor điền thông tin ngân hàng
     ├─ VendorWallet.availableBalance -= amount
     ├─ VendorWallet.reservedBalance += amount
     ├─ PayoutRequest.status = PENDING
     └─ Chờ admin duyệt
     
     ↓
     
[9] ADMIN APPROVE PAYOUT
     │
     ├─ VendorWallet.reservedBalance -= amount
     ├─ Tạo PAYOUT_DEBIT transaction
     ├─ PayoutRequest.status = APPROVED
     │
     └─ ADMIN CHUYỂN TIỀN THẬT NGOÀI HỆ THỐNG
         (Manual bank transfer)
```

---

## 🔄 LUỒNG RETURN/REFUND

### ⚠️ ĐIỀU KIỆN ĐỂ RETURN:
- ✅ Order.status = DELIVERED
- ✅ Còn trong escrow period (escrowDeadlineAt chưa hết hạn)
- ✅ Phải có evidence (hình ảnh minh chứng)

---

### 🎯 NHÁNH 1: VENDOR APPROVE (Happy Path)

```
[R1] CUSTOMER TẠO RETURN REQUEST
     │
     ├─ ReturnRequest.status = REQUESTED
     ├─ Upload evidence (hình ảnh sản phẩm lỗi)
     ├─ Order.status = RETURNING
     └─ Order.escrowDeadlineAt pause (lưu vào escrowRemainingSeconds)
     
     ↓
     
[R2] CUSTOMER GỬI HÀNG VỀ
     │
     ├─ ReturnRequest.status = IN_TRANSIT
     ├─ Customer cung cấp trackingNumber
     └─ Shipper đang giao về vendor
     
     ↓
     
[R3] VENDOR NHẬN HÀNG
     │
     ├─ Vendor xác nhận: markReturnDeliveredToSeller()
     ├─ ReturnRequest.status = DELIVERED_TO_SELLER
     ├─ ReturnRequest.receivedAt = now
     ├─ ReturnRequest.sellerDeadlineAt = now + 48h
     │
     └─ ⏰ VENDOR CÓ 48H ĐỂ KIỂM TRA HÀNG
     
     ↓
     
[R4] VENDOR APPROVE RETURN
     │
     ├─ sellerApproveReturn()
     ├─ ReturnRequest.status = REFUND_SUCCESS
     ├─ ReturnRequest.completedAt = now
     │
     ├─ 💰 LUỒNG TIỀN:
     │   │
     │   ├─ [1] debitVendorForReturnRefund()
     │   │   ├─ Trừ từ VendorWallet.frozenBalance TRƯỚC
     │   │   ├─ Nếu không đủ → trừ tiếp từ availableBalance
     │   │   └─ Tạo RETURN_REFUND_DEBIT transaction
     │   │
     │   └─ [2] refundToCustomerFromEscrow()
     │       ├─ CustomerWallet.balance += refundAmount
     │       ├─ Tạo CREDIT_REFUND transaction
     │       └─ Order.paymentStatus = REFUNDED
     │
     ├─ Order.status = CANCELLED
     └─ ✅ HOÀN TIỀN THÀNH CÔNG
```

---

### ⚠️ NHÁNH 2: VENDOR DISPUTE (Tố cáo gian lận)

```
[R1-R3] Giống nhánh 1
     │
     ↓
     
[R4] VENDOR PHÁT HIỆN GIAN LẬN
     │
     ├─ Vendor kiểm tra hàng return
     ├─ Phát hiện: hàng giả, hàng khác, hàng đã dùng lâu, v.v.
     │
     └─ ❌ VENDOR TỐ CÁO: sellerDisputeReturn()
     
     ↓
     
[R5] CHUYỂN SANG DISPUTE
     │
     ├─ ReturnRequest.status = DISPUTING
     ├─ ReturnRequest.disputeReason = "Lý do tố cáo"
     ├─ ReturnRequest.disputeEvidenceUrl = "Link hình ảnh chứng cứ"
     ├─ ReturnRequest.adminFinalized = false
     │
     └─ 📢 GỬI CHO ADMIN XỬ LÝ
     
     ↓
     
[R6] ADMIN GIẢI QUYẾT TRANH CHẤP
     │
     ├─ Admin xem evidence của cả 2 bên:
     │   ├─ Customer evidence (khi tạo return)
     │   └─ Vendor disputeEvidenceUrl (khi dispute)
     │
     └─ Admin quyết định: adminResolveDispute(winner)
         │
         ├─────────────────────┬─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
    
 [WINNER = CUSTOMER]    [WINNER = SELLER]    [CANCEL]
         │                     │
         │                     │
         ↓                     ↓
         
[R7A] CUSTOMER THẮNG      [R7B] VENDOR THẮNG
     │                         │
     ├─ Status = REFUND_SUCCESS├─ Status = RETURN_REJECTED
     ├─ adminNote lưu lý do    ├─ adminNote lưu lý do
     ├─ adminFinalized = true  ├─ adminFinalized = true
     │                         │
     ├─ 💰 LUỒNG TIỀN:         ├─ 💰 LUỒNG TIỀN:
     │   │                     │   │
     │   ├─ debitVendorFor...  │   ├─ Vendor GIỮ TIỀN
     │   │   └─ Trừ frozen/avail│   │
     │   │                     │   └─ releaseEscrowToAvailable()
     │   └─ refundToCustomer   │       ├─ frozen → available NGAY
     │       └─ Customer nhận   │       └─ Vendor rút được luôn
     │                         │
     ├─ Order.status = CANCELLED├─ Order.status = DELIVERED
     ├─ Order.paymentStatus = REFUNDED
     │                         ├─ Order.escrowDeadlineAt = null
     └─ ✅ CUSTOMER ĐƯỢC HOÀN  └─ ✅ VENDOR ĐƯỢC GIỮ TIỀN
```

---

### ⏰ AUTO-APPROVE NẾU VENDOR KHÔNG PHẢN HỒI

```
[R3] DELIVERED_TO_SELLER
     │
     ├─ sellerDeadlineAt = now + 48h
     │
     ↓
     
[R4] ⏰ QUÁ 48 GIỜ KHÔNG PHẢN HỒI
     │
     ├─ ✅ TRIGGER: ReturnTimeoutScheduler (mỗi giờ)
     │   └─ Tự động gọi sellerApproveReturn()
     │
     ├─ Status = REFUND_SUCCESS
     ├─ updatedBy = "SYSTEM_TIMEOUT"
     │
     └─ 💰 Tự động hoàn tiền cho customer
         (Giống nhánh approve bình thường)
```

---

## 💵 CHI TIẾT WALLET BALANCE

### VendorWallet (3 loại balance)

```java
VendorWallet {
  frozenBalance      // Escrow 7 ngày (chưa rút được)
  availableBalance   // Có thể rút ngay
  reservedBalance    // Đang chờ payout approval
}

Total = frozen + available + reserved
```

**Lifecycle của 1 đơn hàng:**
```
1. Order DELIVERED
   → frozenBalance += vendorPayout

2. Sau 7 ngày (hoặc dispute seller win)
   → frozenBalance -= vendorPayout
   → availableBalance += vendorPayout

3. Vendor tạo payout
   → availableBalance -= amount
   → reservedBalance += amount

4. Admin approve
   → reservedBalance -= amount
   → Tiền ra khỏi hệ thống
```

---

### CustomerWallet

```java
CustomerWallet {
  balance  // Số dư hiện tại
}
```

**Nguồn tiền vào:**
- Refund từ return request
- Nạp tiền (nếu có tính năng)

**Tiền ra:**
- Dùng để mua hàng (nếu support payment từ wallet)
- Rút về tài khoản ngân hàng (nếu có tính năng)

---

## 💰 COMMISSION & PLATFORM REVENUE

### Cách tính commission:

```java
// Khi tạo order
commissionRate = resolveCommissionRatePercent(store)  // Từ CommissionTier
commissionFee = subtotal × (commissionRate / 100)
vendorPayout = subtotal + shippingFee - commissionFee - discount

// Ví dụ:
subtotal = 1,000,000 VND
shippingFee = 30,000 VND
commission rate = 5%
discount = 100,000 VND (voucher)

→ commissionFee = 1,000,000 × 5% = 50,000 VND
→ vendorPayout = 1,000,000 + 30,000 - 50,000 - 100,000 = 880,000 VND
→ Total customer trả = 930,000 VND
```

### Platform thu commission:

```
Customer trả:     1,000,000 (subtotal) + 30,000 (ship) - 100,000 (voucher) = 930,000
Vendor nhận:      880,000 (sau khi trừ commission)
Platform thu:     50,000 (commission)

✅ Balance: 930,000 = 880,000 + 50,000 ✅
```

### Xem commission trong Admin Dashboard:

- **Commission delivered**: `SUM(commissionFee)` từ delivered orders
- **Trend 7 ngày**: Commission theo từng ngày
- **Net Revenue**: GMV - Commission (tiền vendor thực nhận)

---

## 🔐 TRANSACTION SAFETY

### Idempotency (Tránh duplicate)

**Unique constraints:**
```sql
-- VendorWallet Transaction
UNIQUE (order_id, type)          -- 1 order chỉ có 1 ESCROW_CREDIT
UNIQUE (return_request_id, type) -- 1 return chỉ có 1 RETURN_REFUND_DEBIT

-- CustomerWallet Transaction  
UNIQUE (return_request_id, type) -- 1 return chỉ có 1 CREDIT_REFUND
```

### Pessimistic Locking

```java
// Khi update wallet balance
VendorWallet wallet = vendorWalletRepository
    .findByStoreIdForUpdate(storeId)  // SELECT ... FOR UPDATE
    .orElseGet(() -> createWallet(storeId));

// Tránh race condition khi:
// - 2 orders cùng lúc release escrow
// - 1 order refund + 1 order payout đồng thời
```

---

## 📊 ADMIN QUẢN LÝ TÀI CHÍNH

### Dashboard Metrics:

```
- GMV Delivered:           Tổng doanh thu đã giao
- Commission Delivered:    Tổng hoa hồng đã thu
- Total Orders:            Tổng đơn hàng
- Pending Payout Requests: Số yêu cầu rút tiền chờ duyệt
```

### Payout Management:

```
[Vendor Request] → [Pending] → [Admin Review] → [Approve/Reject]
                                      ↓
                                  [Manual Transfer]
                                      ↓
                                [Mark as APPROVED]
```

### Return Dispute Resolution:

```
[Vendor Dispute] → [DISPUTING] → [Admin Review Evidence]
                                      ↓
                        ┌─────────────┴─────────────┐
                        ↓                           ↓
                 [Customer Win]              [Vendor Win]
                   → Refund                   → Keep Money
```

---

## 🎯 TÓM TẮT CÁC TRANSACTION TYPE

### VendorWallet Transaction:

```
ESCROW_CREDIT          // Order delivered → tiền vào frozen
ESCROW_RELEASE         // 7 ngày sau → frozen → available
REFUND_DEBIT           // Order cancel toàn bộ → trừ tiền
RETURN_REFUND_DEBIT    // Return approved → trừ tiền  
PAYOUT_DEBIT           // Vendor rút tiền → trừ available
WITHDRAWAL             // Admin withdrawal (legacy)
```

### CustomerWallet Transaction:

```
CREDIT_REFUND          // Return refund → cộng tiền vào wallet
DEBIT_PURCHASE         // Mua hàng bằng wallet (nếu có)
WITHDRAWAL             // Rút tiền về bank (nếu có)
```

---

## ✅ CHECKLIST HOÀN CHỈNH

- [x] Escrow 7 ngày
- [x] Auto-release escrow (scheduler 2AM daily)
- [x] Auto-approve return timeout (scheduler hourly)
- [x] Commission tracking & dashboard
- [x] Payout request flow (vendor → admin approve)
- [x] Return/Refund logic (happy path)
- [x] Dispute resolution (vendor tố cáo gian lận)
- [x] Transaction idempotency
- [x] Pessimistic locking
- [x] Wallet 3-tier balance
- [x] Admin audit log

---

**Hệ thống luồng tiền hoàn chỉnh cho marketplace fashion!** 🎉
