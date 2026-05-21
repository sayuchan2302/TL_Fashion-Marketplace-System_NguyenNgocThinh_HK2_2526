import { Link } from 'react-router-dom';
import { ChevronRight, Users, Award, Heart, Truck } from 'lucide-react';
import './About.css';

const BRAND_NAME = 'Phố Mặc';

const About = () => {
  return (
    <div className="about-page">
      <div className="about-container">
        {/* Breadcrumb */}
        <div className="about-breadcrumb">
          <Link to="/">Trang chủ</Link>
          <ChevronRight size={14} />
          <span>Về chúng tôi</span>
        </div>

        {/* Hero */}
        <div className="about-hero">
          <div className="about-hero-content">
            <img src="/brand/pho-mac-icon-white.png" alt={`${BRAND_NAME} logo`} className="about-hero-logo" />
            <h1 className="about-hero-title">Câu chuyện {BRAND_NAME}</h1>
            <p className="about-hero-desc">
              {BRAND_NAME} xây dựng không gian mua sắm thời trang hiện đại, nơi mỗi khách hàng
              tìm thấy phong cách riêng qua sản phẩm được tuyển chọn kỹ lưỡng và dịch vụ tận tâm.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="about-stats">
          <div className="about-stat">
            <span className="about-stat-number">50K+</span>
            <span className="about-stat-label">Sản phẩm tuyển chọn</span>
          </div>
          <div className="about-stat">
            <span className="about-stat-number">20K+</span>
            <span className="about-stat-label">Khách hàng hài lòng</span>
          </div>
          <div className="about-stat">
            <span className="about-stat-number">60</span>
            <span className="about-stat-label">Ngày đổi trả</span>
          </div>
          <div className="about-stat">
            <span className="about-stat-number">4.8★</span>
            <span className="about-stat-label">Đánh giá trung bình</span>
          </div>
        </div>

        {/* Values */}
        <div className="about-values">
          <h2 className="about-section-title">Giá trị cốt lõi</h2>
          <div className="about-values-grid">
            <div className="about-value-card">
              <div className="about-value-icon"><Award size={28} /></div>
              <h3>Chất lượng</h3>
              <p>Kiểm soát chất lượng nghiêm ngặt từ nguyên liệu đến thành phẩm.</p>
            </div>
            <div className="about-value-card">
              <div className="about-value-icon"><Heart size={28} /></div>
              <h3>Trải nghiệm</h3>
              <p>Đặt trải nghiệm khách hàng làm trung tâm trong mọi quyết định.</p>
            </div>
            <div className="about-value-card">
              <div className="about-value-icon"><Truck size={28} /></div>
              <h3>Tiện lợi</h3>
              <p>Giao hàng nhanh, đổi trả dễ dàng, thanh toán đa dạng.</p>
            </div>
            <div className="about-value-card">
              <div className="about-value-icon"><Users size={28} /></div>
              <h3>Cộng đồng</h3>
              <p>Kết nối cộng đồng yêu thời trang Việt qua phong cách bền vững.</p>
            </div>
          </div>
        </div>

        {/* Story */}
        <div className="about-story">
          <h2 className="about-section-title">Hành trình phát triển</h2>
          <div className="about-story-wrapper">
            <img 
              src="/brand/pho-mac-logo.png" 
              alt={`${BRAND_NAME} logo`} 
              className="about-story-img"
            />
            <div className="about-timeline">
              <div className="timeline-item">
                <div className="timeline-year">2019</div>
                <div className="timeline-content">
                  <h4>Khởi tạo {BRAND_NAME}</h4>
                  <p>Bắt đầu với mong muốn đưa thời trang chọn lọc đến gần hơn với khách hàng Việt.</p>
                </div>
              </div>
              <div className="timeline-item">
                <div className="timeline-year">2020</div>
                <div className="timeline-content">
                  <h4>Mở rộng quy mô</h4>
                  <p>Mở rộng danh mục sản phẩm, tối ưu trải nghiệm mua sắm trực tuyến.</p>
                </div>
              </div>
              <div className="timeline-item">
                <div className="timeline-year">2022</div>
                <div className="timeline-content">
                  <h4>Đồng hành cùng nhà bán</h4>
                  <p>Kết nối thêm các thương hiệu và cửa hàng thời trang chất lượng trên nền tảng.</p>
                </div>
              </div>
              <div className="timeline-item">
                <div className="timeline-year">2024</div>
                <div className="timeline-content">
                  <h4>Nâng tầm trải nghiệm</h4>
                  <p>Chuẩn hóa dịch vụ, đổi trả và hỗ trợ khách hàng dưới nhận diện {BRAND_NAME}.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;
