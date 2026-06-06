# DANH SÁCH USE CASE CẦN ĐặC TẢ - 16 UC

## ORDER MANAGEMENT (5 UC)

1. **UC1 - Đặt hàng và thanh toán**
   - Actor: Customer
   - Secondary: VNPay/MoMo, GHN

2. **UC2 - Xử lý đơn hàng**
   - Actor: Vendor
   - Secondary: GHN

3. **UC3 - Tạo yêu cầu hoàn trả**
   - Actor: Customer

4. **UC4 - Xử lý yêu cầu hoàn trả**
   - Actor: Vendor

5. **UC5 - Giải quyết tranh chấp hoàn trả**
   - Actor: Admin

---

## AI & SEARCH (1 UC)

6. **UC6 - Tìm kiếm sản phẩm bằng hình ảnh**
   - Actor: Customer
   - Secondary: Vision-Engine API

---

## FINANCIAL MANAGEMENT (2 UC)

7. **UC7 - Yêu cầu giải ngân**
   - Actor: Vendor

8. **UC8 - Duyệt yêu cầu giải ngân**
   - Actor: Admin

---

## PROMOTION (2 UC)

9. **UC9 - Quản lý voucher**
   - Actor: Vendor
   - Note: Store-specific voucher

10. **UC10 - Quản lý voucher**
    - Actor: Admin
    - Note: Platform-wide voucher

---

## VENDOR ONBOARDING (2 UC)

11. **UC11 - Đăng ký Vendor**
    - Actor: User

12. **UC12 - Duyệt đăng ký Vendor**
    - Actor: Admin

---

## PRODUCT GOVERNANCE (3 UC)

13. **UC13 - Quản lý sản phẩm**
    - Actor: Vendor
    - Note: CRUD sản phẩm, upload = bán luôn

14. **UC14 - Xử lý tố cáo sản phẩm**
    - Actor: Admin
    - Note: Reactive moderation

15. **UC15 - Tố cáo sản phẩm**
    - Actor: Customer
    - Note: Community-driven moderation

---

## IMAGE VISION ADMIN (1 UC)

16. **UC16 - Quản lý Image Vision**
    - Actor: Admin
    - Secondary: Vision-Engine API
    - Note: Sync catalog, metrics, troubleshoot

---

## TỔNG KẾT

- **Total:** 16 Use Cases
- **Customer:** 4 UC (UC1, UC3, UC6, UC15)
- **Vendor:** 5 UC (UC2, UC4, UC7, UC9, UC13)
- **Admin:** 6 UC (UC5, UC8, UC10, UC12, UC14, UC16)
- **User:** 1 UC (UC11)

---

## MỖI USE CASE CẦN:

- [ ] Specification (3-5 pages)
- [ ] Activity Diagram (1 page)
- [ ] Sequence Diagram (1 page)

**Estimated: 96 hours total**
