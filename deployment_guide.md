# Hướng Dẫn Triển Khai Hệ Thống Trên AWS EC2 t3.micro

Tài liệu này hướng dẫn bạn từng bước từ cấu hình hệ thống VPS, cài đặt môi trường Docker, thiết lập biến môi trường và chạy cụm 5 container (React Frontend, Spring Backend, FastAPI AI, PostgreSQL + PGVector, Nginx Gateway) đồng thời lấy chứng chỉ SSL HTTPS miễn phí cho domain `pho-mac.bond`.

---

## BƯỚC 1: Cấu Hình RAM Ảo (Swap 4GB) Trên VPS

Tại terminal SSH của bạn (`ubuntu@ip-172-31-33-77:~`), chạy các lệnh sau để tránh máy chủ bị sập khi chạy Docker:

```bash
# 1. Tạo file swap 4GB
sudo fallocate -l 4G /swapfile

# 2. Phân quyền truy cập
sudo chmod 600 /swapfile

# 3. Khởi tạo swap
sudo mkswap /swapfile

# 4. Kích hoạt swap
sudo swapon /swapfile

# 5. Cấu hình tự động bật sau reboot
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 6. Kiểm tra lại RAM và Swap
free -h
```

---

## BƯỚC 2: Cài Đặt Docker & Docker Compose Trên VPS

Chạy các lệnh cài đặt Docker chính thức từ Docker:

```bash
# 1. Cập nhật và cài đặt thư viện cần thiết
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# 2. Thêm khóa GPG của Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 3. Thêm apt repository cho Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 4. Cài đặt Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. Phân quyền chạy docker cho user ubuntu
sudo usermod -aG docker $USER
newgrp docker
```

---

## BƯỚC 3: Đồng Bộ Mã Nguồn Lên VPS & Tạo File Môi Trường `.env`

1. Clone git hoặc copy toàn bộ thư mục project (`backend`, `frontend`, `vision-engine`, `nginx`, `docker-compose.yml`) lên thư mục nào đó trên VPS (ví dụ `/home/ubuntu/fashion-ecommerce`).
2. Tại thư mục gốc của dự án trên VPS, bạn tạo tệp tin `.env` để bảo mật thông tin:
   ```bash
   nano .env
   ```
3. Copy và dán nội dung cấu hình sau vào `.env` (thay thế các thông tin bí mật thực tế của bạn):
   ```ini
   # Database configuration
   DB_NAME=marketplace
   DB_USER=postgres
   DB_PASSWORD=YOUR_STRONG_PASSWORD_HERE

   # Payment gateways Sandbox
   MOMO_PARTNER_CODE=your_momo_partner_code
   MOMO_ACCESS_KEY=your_momo_access_key
   MOMO_SECRET_KEY=your_momo_secret_key
   VNPAY_TMN_CODE=your_vnpay_tmn_code
   VNPAY_HASH_SECRET=your_vnpay_hash_secret

   # Shipping providers Sandbox
   GHN_TOKEN=your_ghn_api_token
   GHN_CLIENT_ID=your_ghn_client_id
   ```

---

## BƯỚC 4: Khởi Chạy Container Bằng HTTP (Port 80)

1. Build và khởi động toàn bộ cụm dịch vụ:
   ```bash
   docker compose up -d --build
   ```
2. Kiểm tra danh sách container đang chạy và giới hạn tài nguyên:
   ```bash
   docker ps
   docker stats
   ```
* Lúc này, bạn truy cập địa chỉ IP public của EC2 hoặc tên miền `http://pho-mac.bond` trên trình duyệt:
  * Trang web Frontend của bạn sẽ hiển thị bình thường.
  * Backend API sẽ chịu trách nhiệm giao tiếp tại `http://api.pho-mac.bond/api/`.

---

## BƯỚC 5: Cấu Hình Chứng Chỉ SSL HTTPS (Let's Encrypt) Miễn Phí

Để kích hoạt HTTPS, bạn cài đặt và chạy Certbot để phát hành chứng chỉ cho tên miền của bạn:

1. Chạy container Certbot dùng một lần để xin chứng chỉ SSL cấp cho tên miền của bạn:
   ```bash
   docker run --rm -it \
     -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
     -v "$(pwd)/certbot/www:/var/www/certbot" \
     certbot/certbot certonly \
     --webroot \
     --webroot-path=/var/www/certbot \
     -d pho-mac.bond -d www.pho-mac.bond -d api.pho-mac.bond \
     --email your_email@gmail.com \
     --agree-tos \
     --no-eff-email
   ```
   *(Trình sinh chứng chỉ sẽ kiểm thử qua cổng port 80 do Nginx Gateway trung chuyển mã xác thực).*

2. **Kích hoạt HTTPS trên Nginx**:
   Mở tệp tin `nginx/nginx.conf` trên VPS của bạn:
   ```bash
   nano nginx/nginx.conf
   ```
   * Uncomment (bỏ dấu `#` ở đầu) toàn bộ các phần khai báo trong mục **`SERVER BLOCK FOR HTTPS (PORT 443)`**.
   * Uncomment phần chuyển đổi URL từ HTTP sang HTTPS:
     ```nginx
     return 301 https://$host$request_uri;
     ```

3. Reload lại cấu hình Nginx Gateway mà không cần dừng container:
   ```bash
   docker exec marketplace-gateway nginx -s reload
   ```

Hệ thống của bạn bây giờ đã bảo mật 100% với HTTPS tại địa chỉ `https://pho-mac.bond`!
