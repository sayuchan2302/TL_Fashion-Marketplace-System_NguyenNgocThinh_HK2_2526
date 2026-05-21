import './FAQ.css';
import { Link } from 'react-router-dom';
import { MessageCircle, Package, ShieldCheck, Search, CreditCard, Ruler } from 'lucide-react';

const BRAND_NAME = 'Phố Mặc';

const faqGroups = [
  {
    title: 'Đơn hàng & vận chuyển',
    items: [
      {
        q: 'Tôi theo dõi đơn hàng như thế nào?',
        a: 'Vào trang Theo dõi đơn (/order-tracking), nhập mã đơn + số điện thoại. Bạn cũng sẽ nhận cập nhật qua email/SMS khi đơn chuyển trạng thái.'
      },
      {
        q: 'Bao lâu tôi nhận được hàng?',
        a: `${BRAND_NAME} giao nội thành trong 1-3 ngày làm việc; ngoại tỉnh 3-5 ngày làm việc. Mùa cao điểm có thể thêm 1-2 ngày, chúng tôi sẽ thông báo nếu có chậm trễ.`
      },
      {
        q: 'Phí vận chuyển tính như thế nào?',
        a: 'Đơn từ 499k được freeship. Dưới 499k: 25k nội thành, 35k ngoại tỉnh. Một số khu vực xa/đảo có thể phụ thu theo hãng vận chuyển.'
      }
    ]
  },
  {
    title: 'Đổi trả & hoàn tiền',
    items: [
      {
        q: 'Điều kiện đổi trả?',
        a: 'Trong 30 ngày, sản phẩm còn tag, chưa giặt/sử dụng, giữ nguyên phụ kiện/hộp. Hàng giảm giá vẫn hỗ trợ đổi size/màu nếu còn hàng.'
      },
      {
        q: 'Quy trình đổi trả ra sao?',
        a: 'Tạo yêu cầu tại /returns hoặc liên hệ CSKH. Đóng gói sản phẩm, gửi về điểm nhận. Sau khi kiểm tra, chúng tôi gửi sản phẩm mới hoặc hoàn tiền theo yêu cầu.'
      },
      {
        q: 'Hoàn tiền mất bao lâu?',
        a: 'Ví/MoMo/ZaloPay: 1-3 ngày; Thẻ/ATM: 3-7 ngày làm việc; COD: hoàn qua chuyển khoản trong 1-2 ngày sau khi nhận hàng trả.'
      }
    ]
  },
  {
    title: 'Thanh toán & bảo mật',
    items: [
      {
        q: 'Tôi có thể thanh toán bằng gì?',
        a: 'COD, thẻ Visa/Master/JCB, ATM nội địa (NAPAS), ví MoMo/ZaloPay, VNPAY. Có thể áp dụng voucher/mã giảm khi thanh toán.'
      },
      {
        q: 'Thanh toán online có an toàn?',
        a: `${BRAND_NAME} dùng cổng thanh toán được cấp phép, mã hóa SSL, không lưu thông tin thẻ. Bạn có thể chọn COD nếu chưa sẵn sàng trả trước.`
      }
    ]
  },
  {
    title: 'Tài khoản & ưu đãi',
    items: [
      {
        q: 'Làm sao đổi mật khẩu?',
        a: 'Vào Tài khoản > Bảo mật hoặc dùng chức năng Quên mật khẩu tại trang đăng nhập. Mật khẩu cần tối thiểu 6 ký tự.'
      },
      {
        q: 'Tôi dùng voucher như thế nào?',
        a: 'Nhập mã ở bước thanh toán. Mỗi đơn chỉ áp dụng 1 mã; mã không quy đổi tiền mặt và có hạn dùng/điều kiện giá trị đơn.'
      }
    ]
  }
];

const quickLinks = [
  { icon: <Search size={18} />, label: 'Theo dõi đơn', to: '/order-tracking' },
  { icon: <Package size={18} />, label: 'Đổi trả online', to: '/returns' },
  { icon: <ShieldCheck size={18} />, label: 'Chính sách', to: '/policy/shipping' },
  { icon: <CreditCard size={18} />, label: 'Kết quả thanh toán', to: '/payment-result?status=pending' },
  { icon: <Ruler size={18} />, label: 'Bảng size', to: '/size-guide' },
  { icon: <MessageCircle size={18} />, label: 'Liên hệ CSKH', to: '/contact' },
];

const FAQ = () => {
  return (
    <div className="faq-page">
      <section className="faq-hero">
        <div className="container faq-hero-inner">
          <div>
            <p className="faq-eyebrow">Trợ giúp & FAQ</p>
            <img src="/brand/pho-mac-logo.png" alt={`${BRAND_NAME} logo`} className="faq-hero-logo" />
            <h1 className="faq-title">Mọi câu hỏi về đơn hàng {BRAND_NAME}</h1>
            <p className="faq-subtitle">Xem nhanh hướng dẫn vận chuyển, đổi trả, thanh toán hoặc liên hệ CSKH {BRAND_NAME}. Thời gian hỗ trợ: 8:00 - 22:00 mỗi ngày.</p>
            <div className="faq-cta-row">
              <Link to="/contact" className="faq-primary">Chat với CSKH</Link>
              <Link to="/returns" className="faq-secondary">Tạo yêu cầu đổi trả</Link>
            </div>
          </div>
          <div className="faq-quick-grid">
            {quickLinks.map((item) => (
              <Link key={item.label} to={item.to} className="faq-quick-card">
                <span className="faq-quick-icon">{item.icon}</span>
                <span className="faq-quick-label">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="faq-content">
        <div className="container faq-grid">
          {faqGroups.map((group) => (
            <div key={group.title} className="faq-block">
              <div className="faq-block-header">
                <h3>{group.title}</h3>
              </div>
              <div className="faq-list">
                {group.items.map((item) => (
                  <details key={item.q} className="faq-item" open>
                    <summary>
                      <span className="faq-question">{item.q}</span>
                    </summary>
                    <p className="faq-answer">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default FAQ;
