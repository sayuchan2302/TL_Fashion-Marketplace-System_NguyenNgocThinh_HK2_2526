import { Link } from 'react-router-dom';
import './Footer.css';
import { Facebook, Instagram, Youtube, MapPin, Phone, Mail, ShieldCheck } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container footer-container">
        <div className="footer-column">
          <h3 className="footer-title">PHỐ MẶC LẮNG NGHE BẠN!</h3>
          <p className="footer-text">
            Chúng tôi luôn trân trọng và mong đợi nhận được mọi ý kiến đóng góp từ khách hàng để có thể
            nâng cấp trải nghiệm dịch vụ và sản phẩm tốt hơn nữa.
          </p>
          <div className="contact-info">
            <div className="contact-item">
              <Phone size={20} />
              <span>Hotline: <strong>1900.27.27.37</strong> (028.7777.2737)</span>
            </div>
            <div className="contact-item">
              <Mail size={20} />
              <span>Email: support@phomac.vn</span>
            </div>
          </div>
          <div className="social-links" aria-label="Kênh mạng xã hội Phố Mặc">
            <a href="#" className="footer-social-btn social-facebook" aria-label="Facebook Phố Mặc"><Facebook size={22} /></a>
            <a href="#" className="footer-social-btn social-instagram" aria-label="Instagram Phố Mặc"><Instagram size={22} /></a>
            <a href="#" className="footer-social-btn social-youtube" aria-label="YouTube Phố Mặc"><Youtube size={22} /></a>
          </div>
        </div>

        <div className="footer-column">
          <h3 className="footer-title">CHÍNH SÁCH MUA HÀNG</h3>
          <ul className="footer-links">
            <li><Link to="/policy/doi-tra">Chính sách đổi trả 60 ngày</Link></li>
            <li><Link to="/policy/khuyen-mai">Chính sách khuyến mãi</Link></li>
            <li><Link to="/policy/bao-mat">Chính sách bảo mật</Link></li>
            <li><Link to="/policy/giao-hang">Chính sách giao hàng</Link></li>
            <li><Link to="/order-tracking">Theo dõi đơn hàng</Link></li>
            <li><Link to="/returns">Đổi/Trả hàng</Link></li>
            <li><Link to="/payment-result?status=pending">Kết quả thanh toán</Link></li>
          </ul>
        </div>

        <div className="footer-column">
          <h3 className="footer-title">VỀ PHỐ MẶC</h3>
          <ul className="footer-links">
            <li><Link to="/about">Câu chuyện Phố Mặc</Link></li>
            <li><Link to="/vendor/register">Trở thành người bán</Link></li>
            <li><Link to="/contact">Liên hệ</Link></li>
            <li><Link to="/size-guide">Bảng size</Link></li>
            <li><Link to="/faq">FAQ</Link></li>
          </ul>
        </div>

        <div className="footer-column">
          <h3 className="footer-title">KHU VỰC VENDOR</h3>
          <ul className="footer-links">
            <li><Link to="/vendor/register">Bán hàng ngay</Link></li>
            <li><Link to="/policy/vendor">Chính sách Vendor</Link></li>
            <li><Link to="/vendor/dashboard">Seller Help</Link></li>
          </ul>
        </div>

        <div className="footer-column">
          <h3 className="footer-title">CHÍNH SÁCH SÀN</h3>
          <ul className="footer-links">
            <li><Link to="/policy/marketplace-tos">Marketplace ToS</Link></li>
            <li><Link to="/policy/san">Chính sách Sàn</Link></li>
            <li><Link to="/policy/dispute">Giải quyết tranh chấp</Link></li>
          </ul>
        </div>

        <div className="footer-column">
          <h3 className="footer-title">ĐỊA CHỈ LIÊN HỆ</h3>
          <div className="address-item">
            <MapPin size={24} className="address-icon" />
            <p><strong>HUB Hà Nội:</strong> Tầng 3-4, Tòa nhà BMM, KM2, Đường Phùng Hưng, Phường Phúc La, Quận Hà Đông, TP Hà Nội</p>
          </div>
          <div className="address-item">
            <MapPin size={24} className="address-icon" />
            <p><strong>HUB Tp. Hồ Chí Minh:</strong> Lầu 1, Số 163 Trần Trọng Cung, Phường Tân Thuận Đông, Quận 7, Tp. Hồ Chí Minh</p>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container bottom-content">
          <p className="copyright-text">&copy; 2024 PHỐ MẶC. All rights reserved. (Clone for academic purposes)</p>
          <div className="payment-methods" aria-label="Phương thức thanh toán">
            <span className="payment-icon payment-momo">
              <img src="https://developers.momo.vn/v3/assets/images/transparent-background-logo-138ebf0ffca865ec0f1a7d9c1e4a9f3c.png" alt="MoMo" />
            </span>
            <span className="payment-icon payment-vnpay">
              <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/10/Logo-VNPAY-QR-1.png" alt="VNPay QR" />
            </span>
            <span className="payment-icon payment-visa">
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Visa_Inc._logo_%282021%E2%80%93present%29.svg/3840px-Visa_Inc._logo_%282021%E2%80%93present%29.svg.png" alt="Visa" />
            </span>
            <span className="payment-icon payment-mastercard"><span className="mc-circles" /> MasterCard</span>
            <span className="commerce-badge">
              <ShieldCheck size={13} />
              ĐÃ THÔNG BÁO BỘ CÔNG THƯƠNG
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
