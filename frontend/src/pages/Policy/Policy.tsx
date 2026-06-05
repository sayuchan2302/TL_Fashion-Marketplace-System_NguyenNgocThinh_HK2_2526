import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Shield, Truck, Lock } from 'lucide-react';
import './Policy.css';

const POLICIES: Record<string, { title: string; icon: React.ReactNode; content: string[] }> = {
  'bao-mat': {
    title: 'Chính sách bảo mật',
    icon: <Lock size={28} />,
    content: [
      'Coolmate cam kết bảo mật tuyệt đối thông tin cá nhân của khách hàng theo quy định của pháp luật Việt Nam.',
      'Thông tin thu thập:\n• Họ tên, số điện thoại, địa chỉ email.\n• Địa chỉ giao hàng.\n• Thông tin thanh toán (được mã hóa SSL).',
      'Mục đích sử dụng:\n• Xử lý và giao đơn hàng.\n• Thông báo chương trình khuyến mãi (có thể hủy đăng ký).\n• Cải thiện trải nghiệm mua sắm.',
      'Cam kết:\n• Không chia sẻ thông tin cho bên thứ ba nếu không có sự đồng ý.\n• Áp dụng các biện pháp bảo mật tiên tiến.\n• Tuân thủ Luật An ninh mạng và Luật Bảo vệ quyền lợi người tiêu dùng.',
    ],
  },
  'giao-hang': {
    title: 'Chính sách giao hàng',
    icon: <Truck size={28} />,
    content: [
      'Coolmate giao hàng toàn quốc với nhiều hình thức vận chuyển linh hoạt.',
      'Thời gian giao hàng:\n• Nội thành Hà Nội & TP.HCM: 1-2 ngày.\n• Các tỉnh thành khác: 3-5 ngày.\n• Vùng sâu vùng xa: 5-7 ngày.',
      'Phí vận chuyển:\n• MIỄN PHÍ cho đơn hàng từ 200.000đ.\n• Đơn hàng dưới 200.000đ: phí 30.000đ.',
      'Đơn vị vận chuyển: GHN, GHTK, Viettel Post.\n\nKhách hàng có thể theo dõi trạng thái đơn hàng trong phần "Lịch sử đơn hàng" trên trang cá nhân.',
    ],
  },
  'khuyen-mai': {
    title: 'Chính sách khuyến mãi',
    icon: <Shield size={28} />,
    content: [
      'Coolmate thường xuyên có các chương trình khuyến mãi hấp dẫn dành cho khách hàng.',
      'Các loại khuyến mãi:\n• Giảm giá trực tiếp trên sản phẩm.\n• Mã giảm giá (Voucher) áp dụng khi thanh toán.\n• Flash Sale theo khung giờ.\n• Ưu đãi sinh nhật cho thành viên.',
      'Điều kiện:\n• Mỗi mã giảm giá chỉ áp dụng 1 lần/đơn hàng.\n• Không áp dụng đồng thời nhiều chương trình.\n• Chương trình có thể thay đổi mà không cần thông báo trước.',
      'Theo dõi các chương trình khuyến mãi mới nhất tại trang chủ và đăng ký nhận thông báo qua email.',
    ],
  },
};

const Policy = () => {
  const { type } = useParams<{ type: string }>();
  const policy = type ? POLICIES[type] : null;

  if (!policy) {
    return (
      <div className="policy-page">
        <div className="policy-container">
          <h1 className="policy-page-title">Chính sách</h1>
          <div className="policy-cards">
            {Object.entries(POLICIES).map(([key, p]) => (
              <Link to={`/policy/${key}`} key={key} className="policy-card-link">
                <div className="policy-card">
                  <div className="policy-card-icon">{p.icon}</div>
                  <h3>{p.title}</h3>
                  <ChevronRight size={18} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="policy-page">
      <div className="policy-container">
        <div className="policy-breadcrumb">
          <Link to="/">Trang chủ</Link>
          <ChevronRight size={14} />
          <Link to="/policy">Chính sách</Link>
          <ChevronRight size={14} />
          <span>{policy.title}</span>
        </div>

        <div className="policy-content-card">
          <div className="policy-header">
            <div className="policy-icon-circle">{policy.icon}</div>
            <h1 className="policy-title">{policy.title}</h1>
          </div>
          <div className="policy-body">
            {policy.content.map((paragraph, i) => (
              <div key={i} className="policy-paragraph">
                {paragraph.split('\n').map((line, j) => (
                  <p key={j}>{line}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Policy;
