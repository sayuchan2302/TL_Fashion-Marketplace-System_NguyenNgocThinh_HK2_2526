package vn.edu.hcmuaf.fit.marketplace.seeder;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import vn.edu.hcmuaf.fit.marketplace.entity.Category;
import vn.edu.hcmuaf.fit.marketplace.entity.ContentPage;
import vn.edu.hcmuaf.fit.marketplace.entity.Store;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.entity.Voucher;
import vn.edu.hcmuaf.fit.marketplace.repository.CategoryRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.ContentPageRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.StoreRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.UserRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.VoucherRepository;
import vn.edu.hcmuaf.fit.marketplace.service.ContentKeywordUtils;
import vn.edu.hcmuaf.fit.marketplace.service.PlatformCommissionSettingsService;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Component
@Order(1)
@ConditionalOnProperty(prefix = "app.seed", name = "enabled", havingValue = "true", matchIfMissing = false)
public class MarketplaceSeeder implements ApplicationRunner {

        private static final Logger log = LoggerFactory.getLogger(MarketplaceSeeder.class);
        private static final String TEST_PASSWORD = "Test@123";
        private static final String SEED_ACTOR = "seed-system";
        private static final String STORE_LOGO_IMAGE = unsplashImage("photo-1441986300917-64674bd600d8", 512, 512);
        private static final String STORE_BANNER_IMAGE = unsplashImage("photo-1523381210434-271e8be1f52b", 1600, 600);
        private static final String CATEGORY_IMAGE = unsplashImage("photo-1441986300917-64674bd600d8", 800, 800);
        private static final String MEN_TOP_IMAGE = "https://www.gap.com/webcontent/0060/843/422/cn60843422.jpg";
        private static final String MEN_PANTS_IMAGE = "https://www.gap.com/webcontent/0055/673/193/cn55673193.jpg";
        private static final String MEN_SPORT_IMAGE = "https://www.gap.com/webcontent/0058/089/131/cn58089131.jpg";
        private static final String MEN_LOUNGE_IMAGE = "https://www.gap.com/webcontent/0028/365/400/cn28365400.jpg";
        private static final String WOMEN_TOP_IMAGE = "https://www.gap.com/webcontent/0061/868/558/cn61868558.jpg";
        private static final String WOMEN_DRESS_IMAGE = "https://www.gap.com/webcontent/0061/530/723/cn61530723.jpg";
        private static final String WOMEN_PANTS_IMAGE = "https://www.gap.com/webcontent/0061/870/502/cn61870502.jpg";
        private static final String WOMEN_SPORT_IMAGE = "https://www.gap.com/webcontent/0061/936/240/cn61936240.jpg";
        private static final String WOMEN_LOUNGE_IMAGE = "https://www.gap.com/webcontent/0061/302/702/cn61302702.jpg";
        private static final String ACCESSORIES_BAGS_WALLETS_IMAGE = "https://www.gap.com/webcontent/0056/071/943/cn56071943.jpg";
        private static final String ACCESSORIES_FASHION_IMAGE = "https://www.gap.com/webcontent/0061/234/303/cn61234303.jpg";
        private static final String ACCESSORIES_OTHER_IMAGE = "https://www.gap.com/webcontent/0057/184/072/cn57184072.jpg";

        private final UserRepository userRepository;
        private final StoreRepository storeRepository;
        private final CategoryRepository categoryRepository;
        private final VoucherRepository voucherRepository;
        private final ContentPageRepository contentPageRepository;
        private final JdbcTemplate jdbcTemplate;
        private final PasswordEncoder passwordEncoder;

        private static String unsplashImage(String photoId, int width, int height) {
                return "https://images.unsplash.com/"
                                + photoId
                                + "?w="
                                + width
                                + "&h="
                                + height
                                + "&fit=crop&fm=webp&q=80&auto=format";
        }

        public MarketplaceSeeder(
                        UserRepository userRepository,
                        StoreRepository storeRepository,
                        CategoryRepository categoryRepository,
                        VoucherRepository voucherRepository,
                        ContentPageRepository contentPageRepository,
                        JdbcTemplate jdbcTemplate,
                        PasswordEncoder passwordEncoder) {
                this.userRepository = userRepository;
                this.storeRepository = storeRepository;
                this.categoryRepository = categoryRepository;
                this.voucherRepository = voucherRepository;
                this.contentPageRepository = contentPageRepository;
                this.jdbcTemplate = jdbcTemplate;
                this.passwordEncoder = passwordEncoder;
        }

        @Override
        @Transactional
        public void run(ApplicationArguments args) {
                truncateAllData();
                seedMarketplace();
        }

        private void seedMarketplace() {
                log.info("Bat dau nap du lieu mau marketplace...");

                User admin = createUser("admin@fashion.local", "Quản trị hệ thống", "0900000001", User.Role.SUPER_ADMIN,
                                User.Gender.OTHER, LocalDate.of(1990, 1, 1), 0L);
                User vendorAn = createUser("an.shop@fashion.local", "Nguyễn Hoàng An", "0900000002", User.Role.VENDOR,
                                User.Gender.MALE, LocalDate.of(1994, 5, 12), 0L);
                User vendorBinh = createUser("binh.store@fashion.local", "Trần Gia Bình", "0900000003",
                                User.Role.VENDOR, User.Gender.FEMALE, LocalDate.of(1995, 8, 22), 0L);
                User vendorDuyet = createUser("duyet.vendor@fashion.local", "Lê Thanh Duyệt", "0900000004",
                                User.Role.VENDOR, User.Gender.MALE, LocalDate.of(1992, 11, 6), 0L);
                User vendorChi = createUser("chi.trendy@fashion.local", "Ngô Mỹ Chi", "0900000005", User.Role.VENDOR,
                                User.Gender.FEMALE, LocalDate.of(1997, 7, 19), 0L);
                User vendorPhong = createUser("phong.street@fashion.local", "Phan Đức Phong", "0900000006",
                                User.Role.VENDOR, User.Gender.MALE, LocalDate.of(1993, 4, 2), 0L);
                User vendorNgoc = createUser("ngoc.linen@fashion.local", "Bùi Nhã Ngọc", "0900000007", User.Role.VENDOR,
                                User.Gender.FEMALE, LocalDate.of(1996, 12, 8), 0L);
                User vendorKhanh = createUser("khanh.accessory@fashion.local", "Đặng Minh Khánh", "0900000008",
                                User.Role.VENDOR, User.Gender.MALE, LocalDate.of(1991, 10, 28), 0L);
                User customerMinh = createUser("minh.customer@fashion.local", "Phạm Minh Khang", "0901000001",
                                User.Role.CUSTOMER, User.Gender.MALE, LocalDate.of(2000, 3, 14), 4200L);
                User customerLan = createUser("lan.customer@fashion.local", "Đỗ Ngọc Lan", "0901000002",
                                User.Role.CUSTOMER, User.Gender.FEMALE, LocalDate.of(1999, 9, 9), 5100L);
                User customerHuy = createUser("huy.customer@fashion.local", "Vũ Đức Huy", "0901000003",
                                User.Role.CUSTOMER, User.Gender.MALE, LocalDate.of(2001, 1, 25), 1600L);

                Store storeAn = createStore(
                                vendorAn, "An Urban", "an-urban",
                                "Chuyên thời trang nam tối giản, chất liệu cao cấp.",
                                "45 Nguyễn Trãi, Quận 1, TP. Hồ Chí Minh",
                                Store.StoreStatus.ACTIVE, Store.ApprovalStatus.APPROVED,
                                new BigDecimal("6.0"), 4.8, 148, new BigDecimal("128900000"),
                                LocalDateTime.now().minusDays(30), admin.getEmail(), null);
                Store storeBinh = createStore(
                                vendorBinh, "Bình Boutique", "binh-boutique",
                                "Thời trang nữ công sở và dự tiệc, phong cách thanh lịch.",
                                "117 Hai Bà Trưng, Quận 3, TP. Hồ Chí Minh",
                                Store.StoreStatus.ACTIVE, Store.ApprovalStatus.APPROVED,
                                new BigDecimal("5.5"), 4.6, 96, new BigDecimal("84200000"),
                                LocalDateTime.now().minusDays(15), admin.getEmail(), null);
                Store storeChoDuyet = createStore(
                                vendorDuyet, "Duyệt Local Brand", "duyet-local-brand",
                                "Gian hàng mới đăng ký, đang chờ đội ngũ kiểm duyệt.",
                                "22 Lý Tự Trọng, Quận 1, TP. Hồ Chí Minh",
                                Store.StoreStatus.INACTIVE, Store.ApprovalStatus.PENDING,
                                new BigDecimal("5.0"), 0.0, 0, BigDecimal.ZERO,
                                null, null, "Đang chờ bổ sung giấy phép kinh doanh.");
                Store storeChi = createStore(
                                vendorChi, "Chi Trendy", "chi-trendy",
                                "Thời trang nữ trẻ trung, cập nhật xu hướng theo mùa.",
                                "89 Võ Văn Tần, Quận 3, TP. Hồ Chí Minh",
                                Store.StoreStatus.ACTIVE, Store.ApprovalStatus.APPROVED,
                                new BigDecimal("5.2"), 4.7, 121, new BigDecimal("96300000"),
                                LocalDateTime.now().minusDays(20), admin.getEmail(), null);
                Store storePhong = createStore(
                                vendorPhong, "Phong Streetwear", "phong-streetwear",
                                "Chuyên đồ streetwear nam, năng động và cá tính.",
                                "211 Lê Văn Sỹ, Quận Phú Nhuận, TP. Hồ Chí Minh",
                                Store.StoreStatus.ACTIVE, Store.ApprovalStatus.APPROVED,
                                new BigDecimal("6.2"), 4.5, 88, new BigDecimal("73400000"),
                                LocalDateTime.now().minusDays(18), admin.getEmail(), null);
                Store storeNgoc = createStore(
                                vendorNgoc, "Ngọc Linen House", "ngoc-linen-house",
                                "Sản phẩm vải linen tối giản cho phong cách thanh lịch.",
                                "56 Nguyễn Gia Trí, Bình Thạnh, TP. Hồ Chí Minh",
                                Store.StoreStatus.ACTIVE, Store.ApprovalStatus.APPROVED,
                                new BigDecimal("4.8"), 4.4, 64, new BigDecimal("51800000"),
                                LocalDateTime.now().minusDays(12), admin.getEmail(), null);
                Store storeKhanh = createStore(
                                vendorKhanh, "Khánh Accessories", "khanh-accessories",
                                "Phụ kiện thời trang unisex: túi, ví, thắt lưng và mũ nón.",
                                "101 Âu Cơ, Quận Tân Bình, TP. Hồ Chí Minh",
                                Store.StoreStatus.SUSPENDED, Store.ApprovalStatus.APPROVED,
                                new BigDecimal("5.9"), 4.1, 37, new BigDecimal("27500000"),
                                LocalDateTime.now().minusDays(8), admin.getEmail(), null);
                linkVendorStore(vendorAn, storeAn);
                linkVendorStore(vendorBinh, storeBinh);
                linkVendorStore(vendorDuyet, storeChoDuyet);
                linkVendorStore(vendorChi, storeChi);
                linkVendorStore(vendorPhong, storePhong);
                linkVendorStore(vendorNgoc, storeNgoc);
                linkVendorStore(vendorKhanh, storeKhanh);

                // Category tree 3 tầng: Root (Nam/Nữ/Phụ kiện) -> Nhóm -> Danh mục lá
                // Lưu ý: Category.name đang unique toàn cục, nên tên có hậu tố nam/nữ để tránh
                // trùng.
                Category namRoot = createCategory("Nam", "men", "Danh mục gốc cho thời trang nam.", null, 1);
                Category nuRoot = createCategory("Nữ", "women", "Danh mục gốc cho thời trang nữ.", null, 2);
                Category phuKienRoot = createCategory("Phụ kiện", "accessories", "Danh mục gốc cho phụ kiện.", null, 3);

                // Level 2 - Nam
                Category namAo = createCategory("Áo nam", "men-ao", "Nhóm áo dành cho nam.", namRoot, 10,
                                MEN_TOP_IMAGE);
                Category namQuan = createCategory("Quần nam", "men-quan", "Nhóm quần dành cho nam.", namRoot, 20,
                                MEN_PANTS_IMAGE);
                Category namTheThao = createCategory("Đồ thể thao nam", "men-do-the-thao", "Nhóm đồ thể thao nam.",
                                namRoot, 30, MEN_SPORT_IMAGE);
                Category namMacNha = createCategory("Đồ mặc nhà nam", "men-do-mac-nha", "Nhóm đồ mặc nhà nam.", namRoot,
                                40, MEN_LOUNGE_IMAGE);

                // Level 2 - Nữ
                Category nuAo = createCategory("Áo nữ", "women-ao", "Nhóm áo dành cho nữ.", nuRoot, 10,
                                WOMEN_TOP_IMAGE);
                Category nuVayDam = createCategory("Váy đầm nữ", "women-vay-dam", "Nhóm váy đầm dành cho nữ.", nuRoot,
                                20, WOMEN_DRESS_IMAGE);
                Category nuQuan = createCategory("Quần nữ", "women-quan", "Nhóm quần dành cho nữ.", nuRoot, 30,
                                WOMEN_PANTS_IMAGE);
                Category nuTheThao = createCategory("Đồ thể thao nữ", "women-do-the-thao", "Nhóm đồ thể thao nữ.",
                                nuRoot, 40, WOMEN_SPORT_IMAGE);
                Category nuMacNha = createCategory("Đồ mặc nhà nữ", "women-do-mac-nha", "Nhóm đồ mặc nhà nữ.", nuRoot,
                                50, WOMEN_LOUNGE_IMAGE);

                // Level 2 - Phụ kiện
                Category pkTuiVaVi = createCategory("Túi và ví", "accessories-tui-va-vi", "Nhóm túi và ví.",
                                phuKienRoot, 10, ACCESSORIES_BAGS_WALLETS_IMAGE);
                Category pkThoiTrang = createCategory("Phụ kiện thời trang", "accessories-phu-kien-thoi-trang",
                                "Nhóm phụ kiện thời trang.", phuKienRoot, 20, ACCESSORIES_FASHION_IMAGE);
                Category pkKhac = createCategory("Phụ kiện khác", "accessories-phu-kien-khac", "Nhóm phụ kiện khác.",
                                phuKienRoot, 30, ACCESSORIES_OTHER_IMAGE);

                // Level 3 - Nam > Áo
                Category menAoThun = createCategory("Áo thun nam", "men-ao-thun", "Áo thun nam.", namAo, 1);
                Category menAoPolo = createCategory("Áo polo nam", "men-ao-polo", "Áo polo nam.", namAo, 2);
                createCategory("Áo sơ mi nam", "men-ao-so-mi", "Áo sơ mi nam.", namAo, 3);
                createCategory("Áo hoodie nam", "men-ao-hoodie", "Áo hoodie nam.", namAo, 4);
                createCategory("Áo len nam", "men-ao-len", "Áo len nam.", namAo, 5);

                // Level 3 - Nam > Quần
                Category menQuanJeans = createCategory("Quần jeans nam", "men-quan-jeans", "Quần jeans nam.", namQuan,
                                1);
                createCategory("Quần tây nam", "men-quan-tay", "Quần tây nam.", namQuan, 2);
                Category menQuanKaki = createCategory("Quần kaki nam", "men-quan-kaki", "Quần kaki nam.", namQuan, 3);
                createCategory("Quần short nam", "men-quan-short", "Quần short nam.", namQuan, 4);
                createCategory("Quần jogger nam", "men-quan-jogger", "Quần jogger nam.", namQuan, 5);

                // Level 3 - Nam > Đồ thể thao
                createCategory("Áo thể thao nam", "men-ao-the-thao", "Áo thể thao nam.", namTheThao, 1);
                createCategory("Quần thể thao nam", "men-quan-the-thao", "Quần thể thao nam.", namTheThao, 2);
                createCategory("Set thể thao nam", "men-set-the-thao", "Set thể thao nam.", namTheThao, 3);

                // Level 3 - Nam > Đồ mặc nhà
                createCategory("Áo mặc nhà nam", "men-ao-mac-nha", "Áo mặc nhà nam.", namMacNha, 1);
                createCategory("Quần mặc nhà nam", "men-quan-mac-nha", "Quần mặc nhà nam.", namMacNha, 2);
                createCategory("Bộ mặc nhà nam", "men-bo-mac-nha", "Bộ mặc nhà nam.", namMacNha, 3);

                // Level 3 - Nữ > Áo
                createCategory("Áo thun nữ", "women-ao-thun", "Áo thun nữ.", nuAo, 1);
                createCategory("Áo kiểu nữ", "women-ao-kieu", "Áo kiểu nữ.", nuAo, 2);
                Category womenAoSoMi = createCategory("Áo sơ mi nữ", "women-ao-so-mi", "Áo sơ mi nữ.", nuAo, 3);
                createCategory("Áo croptop nữ", "women-ao-croptop", "Áo croptop nữ.", nuAo, 4);
                Category womenAoKhoac = createCategory("Áo khoác nữ", "women-ao-khoac", "Áo khoác nữ.", nuAo, 5);

                // Level 3 - Nữ > Váy/Đầm
                Category womenVayLien = createCategory("Váy liền nữ", "women-vay-lien", "Váy liền nữ.", nuVayDam, 1);
                createCategory("Váy dự tiệc nữ", "women-vay-du-tiec", "Váy dự tiệc nữ.", nuVayDam, 2);
                createCategory("Váy công sở nữ", "women-vay-cong-so", "Váy công sở nữ.", nuVayDam, 3);
                createCategory("Váy maxi nữ", "women-vay-maxi", "Váy maxi nữ.", nuVayDam, 4);

                // Level 3 - Nữ > Quần
                Category womenQuanJeans = createCategory("Quần jeans nữ", "women-quan-jeans", "Quần jeans nữ.", nuQuan,
                                1);
                createCategory("Quần short nữ", "women-quan-short", "Quần short nữ.", nuQuan, 2);
                createCategory("Quần tây nữ", "women-quan-tay", "Quần tây nữ.", nuQuan, 3);
                createCategory("Quần legging nữ", "women-quan-legging", "Quần legging nữ.", nuQuan, 4);

                // Level 3 - Nữ > Đồ thể thao
                createCategory("Áo thể thao nữ", "women-ao-the-thao", "Áo thể thao nữ.", nuTheThao, 1);
                createCategory("Quần thể thao nữ", "women-quan-the-thao", "Quần thể thao nữ.", nuTheThao, 2);
                createCategory("Set thể thao nữ", "women-set-the-thao", "Set thể thao nữ.", nuTheThao, 3);

                // Level 3 - Nữ > Đồ mặc nhà
                createCategory("Áo mặc nhà nữ", "women-ao-mac-nha", "Áo mặc nhà nữ.", nuMacNha, 1);
                createCategory("Quần mặc nhà nữ", "women-quan-mac-nha", "Quần mặc nhà nữ.", nuMacNha, 2);
                createCategory("Bộ mặc nhà nữ", "women-bo-mac-nha", "Bộ mặc nhà nữ.", nuMacNha, 3);

                // Level 3 - Phụ kiện
                createCategory("Túi xách", "tui-xach", "Túi xách.", pkTuiVaVi, 1);
                Category accessoryTuiDeoCheo = createCategory("Túi đeo chéo", "tui-deo-cheo", "Túi đeo chéo.",
                                pkTuiVaVi, 2);
                Category accessoryBalo = createCategory("Balo", "balo", "Balo.", pkTuiVaVi, 3);
                Category accessoryVi = createCategory("Ví", "vi", "Ví.", pkTuiVaVi, 4);

                createCategory("Nón mũ", "non-mu", "Nón mũ.", pkThoiTrang, 1);
                createCategory("Thắt lưng", "that-lung", "Thắt lưng.", pkThoiTrang, 2);
                createCategory("Khăn", "khan", "Khăn.", pkThoiTrang, 3);
                createCategory("Tất", "tat", "Tất.", pkThoiTrang, 4);

                createCategory("Kính mắt", "kinh-mat", "Kính mắt.", pkKhac, 1);
                createCategory("Đồng hồ", "dong-ho", "Đồng hồ.", pkKhac, 2);
                createCategory("Trang sức", "trang-suc", "Trang sức.", pkKhac, 3);

                createVoucher(storeAn.getId(), "CHAOAN10", "Giảm 10% đơn đầu tiên",
                                "Áp dụng cho khách mới, tối đa giảm 40.000đ.", Voucher.DiscountType.PERCENT,
                                new BigDecimal("10"), new BigDecimal("299000"), 1500, 320,
                                Voucher.VoucherStatus.RUNNING, LocalDate.now().minusDays(15),
                                LocalDate.now().plusDays(45));
                createVoucher(storeAn.getId(), "FREESHIP30", "Hỗ trợ phí ship 30k",
                                "Giảm trực tiếp 30.000đ vào phí vận chuyển.", Voucher.DiscountType.FIXED,
                                new BigDecimal("30000"), new BigDecimal("199000"), 900, 440,
                                Voucher.VoucherStatus.RUNNING, LocalDate.now().minusDays(5),
                                LocalDate.now().plusDays(20));
                createVoucher(storeBinh.getId(), "BINHNEW12", "Chào mừng khách mới",
                                "Giảm 12% toàn bộ sản phẩm của gian hàng.", Voucher.DiscountType.PERCENT,
                                new BigDecimal("12"), new BigDecimal("399000"), 1100, 210,
                                Voucher.VoucherStatus.RUNNING, LocalDate.now().minusDays(20),
                                LocalDate.now().plusDays(35));
                createVoucher(storeBinh.getId(), "BINH50K", "Giảm trực tiếp 50k", "Giảm 50.000đ cho đơn từ 699.000đ.",
                                Voucher.DiscountType.FIXED, new BigDecimal("50000"), new BigDecimal("699000"), 500, 127,
                                Voucher.VoucherStatus.DRAFT, LocalDate.now().plusDays(2), LocalDate.now().plusDays(60));

                createContentPage(
                                ContentPage.ContentType.FAQ,
                                "Thời gian xử lý đơn hàng",
                                "Đơn hàng thường được xác nhận trong 2-6 giờ làm việc và bàn giao đơn vị vận chuyển trong 24 giờ.",
                                1,
                                List.of("trang thai don hang", "giao hang", "ship"));
                createContentPage(
                                ContentPage.ContentType.FAQ,
                                "Tôi có thể đổi size như thế nào?",
                                "Bạn có thể gửi yêu cầu đổi trả trong vòng 7 ngày kể từ khi nhận hàng tại mục Đơn hàng của tôi.",
                                2,
                                List.of("doi size", "doi tra", "tra hang"));
                createContentPage(
                                ContentPage.ContentType.POLICY,
                                "Chính sách đổi trả",
                                "Marketplace hỗ trợ đổi/trả cho sản phẩm lỗi hoặc sai mô tả. Sản phẩm cần còn tem nhãn và chưa qua sử dụng.",
                                1,
                                List.of());
                createContentPage(
                                ContentPage.ContentType.POLICY,
                                "Chính sách hoàn tiền",
                                "Tiền hoàn sẽ được xử lý trong 3-7 ngày làm việc tùy phương thức thanh toán ban đầu.",
                                2,
                                List.of());

                log.info("Seed hoan tat: {} users, {} stores, {} categories, {} vouchers, {} pages.",
                                userRepository.count(), storeRepository.count(), categoryRepository.count(),
                                voucherRepository.count(), contentPageRepository.count());
        }

        private void truncateAllData() {
                jdbcTemplate.execute("""
                                TRUNCATE TABLE
                                    review_images,
                                    return_items,
                                    wallet_transactions,
                                    vendor_wallets,
                                    customer_wallet_transactions,
                                    customer_wallets,
                                    inventory_ledger,
                                    wishlists,
                                    notifications,
                                    loyalty_points,
                                    coupons,
                                    commission_tiers,
                                    return_requests,
                                    reviews,
                                    order_items,
                                    orders,
                                    cart_items,
                                    carts,
                                    flash_sale_items,
                                    flash_sale_campaigns,
                                    vouchers,
                                    product_variants,
                                    product_images,
                                    products,
                                    categories,
                                    content_pages,
                                    addresses,
                                    stores,
                                    users
                                RESTART IDENTITY CASCADE
                                """);
                jdbcTemplate.execute("""
                                ALTER TABLE return_requests
                                DROP CONSTRAINT IF EXISTS return_requests_status_check
                                """);
                jdbcTemplate.execute("""
                                ALTER TABLE return_requests
                                ADD CONSTRAINT return_requests_status_check
                                CHECK (
                                    status IN (
                                        'REQUESTED',
                                        'IN_TRANSIT',
                                        'DELIVERED_TO_SELLER',
                                        'REFUND_SUCCESS',
                                        'DISPUTING',
                                        'RETURN_REJECTED',
                                        'CANCELLED'
                                    )
                                )
                                """);
                jdbcTemplate.execute("""
                                ALTER TABLE orders
                                DROP CONSTRAINT IF EXISTS orders_status_check
                                """);
                jdbcTemplate.execute("""
                                ALTER TABLE orders
                                DROP CONSTRAINT IF EXISTS orders_status_check1
                                """);
                jdbcTemplate.execute("""
                                ALTER TABLE orders
                                ADD CONSTRAINT orders_status_check
                                CHECK (
                                    status IN (
                                        'PENDING',
                                        'WAITING_FOR_VENDOR',
                                        'CONFIRMED',
                                        'PROCESSING',
                                        'SHIPPED',
                                        'DELIVERED',
                                        'COMPLETED',
                                        'CANCELLED',
                                        'RETURNING'
                                    )
                                )
                                """);
                log.info("Da xoa toan bo du lieu cu truoc khi seed.");
        }

        private User createUser(
                        String email,
                        String name,
                        String phone,
                        User.Role role,
                        User.Gender gender,
                        LocalDate dateOfBirth,
                        Long loyaltyPoints) {
                User user = new User();
                user.setEmail(email);
                user.setPassword(passwordEncoder.encode(TEST_PASSWORD));
                user.setName(name);
                user.setPhone(phone);
                user.setRole(role);
                user.setGender(gender);
                user.setDateOfBirth(dateOfBirth);
                user.setLoyaltyPoints(loyaltyPoints != null ? loyaltyPoints : 0L);
                user.setStoreId(null);
                user.setIsActive(true);
                return userRepository.save(user);
        }

        private void linkVendorStore(User vendor, Store store) {
                vendor.setStoreId(store.getId());
                userRepository.save(vendor);
        }

        private Store createStore(
                        User owner,
                        String name,
                        String slug,
                        String description,
                        String address,
                        Store.StoreStatus status,
                        Store.ApprovalStatus approvalStatus,
                        BigDecimal commissionRate,
                        double rating,
                        int totalOrders,
                        BigDecimal totalSales,
                        LocalDateTime approvedAt,
                        String approvedBy,
                        String rejectionReason) {
                Store store = new Store();
                store.setOwner(owner);
                store.setName(name);
                store.setSlug(slug);
                store.setDescription(description);
                store.setLogo(STORE_LOGO_IMAGE);
                store.setBanner(STORE_BANNER_IMAGE);
                store.setContactEmail(owner.getEmail());
                store.setPhone(owner.getPhone());
                store.setAddress(address);
                store.setBankName("Vietcombank");
                store.setBankAccountNumber("1234567890");
                store.setBankAccountHolder(owner.getName().toUpperCase());
                store.setBankVerified(true);
                store.setNotifyNewOrder(true);
                store.setNotifyOrderStatusChange(true);
                store.setNotifyLowStock(true);
                store.setNotifyPayoutComplete(true);
                store.setNotifyPromotions(false);
                store.setShipGhn(true);
                store.setShipGhtk(true);
                store.setShipExpress(false);
                store.setWarehouseAddress(address);
                store.setWarehouseContact(owner.getName());
                store.setWarehousePhone(owner.getPhone());
                store.setCommissionRate(commissionRate);
                store.setUsesDefaultCommissionRate(
                                commissionRate == null
                                                || commissionRate.compareTo(
                                                                PlatformCommissionSettingsService.DEFAULT_COMMISSION_RATE_PERCENT) == 0);
                store.setStatus(status);
                store.setApprovalStatus(approvalStatus);
                store.setApprovedAt(approvedAt);
                store.setApprovedBy(approvedBy);
                store.setRejectionReason(rejectionReason);
                store.setTotalSales(totalSales);
                store.setTotalOrders(totalOrders);
                store.setRating(rating);
                return storeRepository.save(store);
        }

        private Category createCategory(String name, String slug, String description, Category parent, int sortOrder) {
                return createCategory(name, slug, description, parent, sortOrder, CATEGORY_IMAGE);
        }

        private Category createCategory(String name, String slug, String description, Category parent, int sortOrder,
                        String image) {
                Category category = new Category();
                category.setName(name);
                category.setSlug(slug);
                category.setDescription(description);
                category.setParent(parent);
                category.setSortOrder(sortOrder);
                category.setImage(image);
                return categoryRepository.save(category);
        }

        private void createVoucher(
                        UUID storeId,
                        String code,
                        String name,
                        String description,
                        Voucher.DiscountType discountType,
                        BigDecimal discountValue,
                        BigDecimal minOrderValue,
                        int totalIssued,
                        int usedCount,
                        Voucher.VoucherStatus status,
                        LocalDate startDate,
                        LocalDate endDate) {
                Voucher voucher = new Voucher();
                voucher.setCreatorRole(Voucher.CreatorRole.VENDOR);
                voucher.setStoreId(storeId);
                voucher.setCode(code);
                voucher.setName(name);
                voucher.setDescription(description);
                voucher.setDiscountType(discountType);
                voucher.setDiscountValue(discountValue);
                voucher.setMinOrderValue(minOrderValue);
                voucher.setTotalIssued(totalIssued);
                voucher.setUsedCount(usedCount);
                voucher.setStatus(status);
                voucher.setStartDate(startDate);
                voucher.setEndDate(endDate);
                voucher.setUpdatedBy(SEED_ACTOR);
                voucherRepository.save(voucher);
        }

        private void createContentPage(
                        ContentPage.ContentType type,
                        String title,
                        String body,
                        int displayOrder,
                        List<String> keywords) {
                ContentPage page = new ContentPage();
                page.setType(type);
                page.setTitle(title);
                page.setBody(body);
                page.setDisplayOrder(displayOrder);
                page.setUpdatedBy(SEED_ACTOR);
                page.setKeywords(ContentKeywordUtils.encodeKeywords(keywords));
                contentPageRepository.save(page);
        }
}
