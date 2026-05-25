package vn.edu.hcmuaf.fit.marketplace.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import vn.edu.hcmuaf.fit.marketplace.dto.response.ApiErrorResponse;
import vn.edu.hcmuaf.fit.marketplace.security.ImageSearchRateLimitFilter;
import vn.edu.hcmuaf.fit.marketplace.security.JwtAuthenticationFilter;

import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Objects;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final ImageSearchRateLimitFilter imageSearchRateLimitFilter;
    private final ObjectMapper objectMapper;
    private final AppSecurityProperties securityProperties;

    public SecurityConfig(
            JwtAuthenticationFilter jwtAuthenticationFilter,
            ImageSearchRateLimitFilter imageSearchRateLimitFilter,
            ObjectMapper objectMapper,
            AppSecurityProperties securityProperties) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.imageSearchRateLimitFilter = imageSearchRateLimitFilter;
        this.objectMapper = objectMapper;
        this.securityProperties = securityProperties;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) -> {
                            writeErrorResponse(
                                    response,
                                    HttpStatus.UNAUTHORIZED,
                                    request.getRequestURI(),
                                    "Authentication required or token is invalid");
                        })
                        .accessDeniedHandler((request, response, accessDeniedException) -> {
                            writeErrorResponse(
                                    response,
                                    HttpStatus.FORBIDDEN,
                                    request.getRequestURI(),
                                    "You do not have permission to access this resource");
                        }))
                .authorizeHttpRequests(auth -> auth
                        // ─── Public endpoints (no auth required) ───────────────────────────
                        .requestMatchers(HttpMethod.GET, "/").permitAll()
                        .requestMatchers(HttpMethod.GET, "/favicon.ico").permitAll()
                        .requestMatchers(HttpMethod.GET, "/uploads/**").permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/api/shipping/ghn/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/**").permitAll()
                        .requestMatchers("/api/public/**").permitAll()
                        .requestMatchers("/api/internal/vision/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/vouchers/public").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/payments/vnpay/ipn").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/payments/vnpay/return/verify").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/payments/momo/ipn").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/payments/momo/return/verify").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/messages").permitAll()
                        .requestMatchers(HttpMethod.OPTIONS, "/api/messages").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/bot/token").permitAll()
                        .requestMatchers(HttpMethod.OPTIONS, "/api/bot/token").permitAll()
                        .requestMatchers("/ws/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").hasRole("SUPER_ADMIN")
                        .requestMatchers("/actuator/**").hasRole("SUPER_ADMIN")

                        // ─── Commission Tiers: public read, admin write ──────────────────────
                        .requestMatchers(HttpMethod.GET, "/api/commission-tiers").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/commission-tiers/default").permitAll()
                        .requestMatchers("/api/commission-tiers/**").hasRole("SUPER_ADMIN")

                        // ─── Content pages ────────────────────────────────────────────────
                        .requestMatchers("/api/admin/content/**").hasRole("SUPER_ADMIN")

                        // Vendor/admin private workspace endpoints
                        .requestMatchers("/api/orders/my-store", "/api/orders/my-store/**")
                        .hasAnyRole("VENDOR", "SUPER_ADMIN")
                        .requestMatchers("/api/vendor/orders", "/api/vendor/orders/**")
                        .hasAnyRole("VENDOR", "SUPER_ADMIN")
                        .requestMatchers("/api/products/my-store", "/api/products/my-store/**")
                        .hasAnyRole("VENDOR", "SUPER_ADMIN")
                        .requestMatchers("/api/vouchers/my-store", "/api/vouchers/my-store/**")
                        .hasAnyRole("VENDOR", "SUPER_ADMIN")

                        // ─── Products: public read, vendor/admin write ─────────────────────
                        .requestMatchers(HttpMethod.GET, "/api/products").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/products/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/products/*/report").hasRole("CUSTOMER")
                        .requestMatchers(HttpMethod.POST, "/api/products/**").hasAnyRole("VENDOR", "SUPER_ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/products/**").hasAnyRole("VENDOR", "SUPER_ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/products/**").hasAnyRole("VENDOR", "SUPER_ADMIN")

                        // ─── Categories: public read, admin-only write ─────────────────────
                        .requestMatchers(HttpMethod.GET, "/api/categories").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/categories/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/categories").hasRole("SUPER_ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/categories/**").hasRole("SUPER_ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/categories/**").hasRole("SUPER_ADMIN")

                        // ─── Stores: public read, registration requires auth, admin approval ─
                        .requestMatchers(HttpMethod.GET, "/api/stores").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/stores/my-store").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/stores/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/stores/register").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/stores/*/follow").authenticated()
                        .requestMatchers(HttpMethod.DELETE, "/api/stores/*/follow").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/stores/*/approve").hasRole("SUPER_ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/stores/*/reject").hasRole("SUPER_ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/stores/*/suspend").hasRole("SUPER_ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/stores/*/reactivate").hasRole("SUPER_ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/stores/**").hasAnyRole("VENDOR", "SUPER_ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/stores/**").hasRole("SUPER_ADMIN")

                        // ─── Orders: authenticated users only ──────────────────────────────
                        .requestMatchers(HttpMethod.GET, "/api/orders").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/orders/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/orders").authenticated()
                        .requestMatchers(HttpMethod.PUT, "/api/orders/*/status").hasAnyRole("VENDOR", "SUPER_ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/orders/**").authenticated()
                        .requestMatchers(HttpMethod.DELETE, "/api/orders/**").hasRole("SUPER_ADMIN")

                        // ─── Reviews: public read, customer submit, scoped admin/vendor ops ─
                        .requestMatchers(HttpMethod.GET, "/api/reviews/product/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/reviews/store/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/reviews").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/reviews/my").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/reviews/my/eligible").authenticated()
                        .requestMatchers("/api/reviews/my-store", "/api/reviews/my-store/**")
                        .hasAnyRole("VENDOR", "SUPER_ADMIN")
                        .requestMatchers("/api/reviews/admin/**").hasRole("SUPER_ADMIN")

                        // ─── Cart: authenticated users ─────────────────────────────────────
                        .requestMatchers("/api/cart").authenticated()
                        .requestMatchers("/api/cart/**").authenticated()

                        // ─── Addresses: authenticated users ────────────────────────────────
                        .requestMatchers("/api/addresses/**").authenticated()

                        // ─── Returns ───────────────────────────────────────────────────────
                        .requestMatchers("/api/returns/**").authenticated()

                        // ─── Coupons: public read, admin write ─────────────────────────────
                        .requestMatchers(HttpMethod.GET, "/api/coupons/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/coupons").hasRole("SUPER_ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/coupons/**").hasRole("SUPER_ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/coupons/**").hasRole("SUPER_ADMIN")

                        // ─── Admin endpoints: SUPER_ADMIN only ─────────────────────────────
                        .requestMatchers("/api/admin/**").hasRole("SUPER_ADMIN")

                        // ─── Default: require authentication ───────────────────────────────
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(imageSearchRateLimitFilter, JwtAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public FilterRegistrationBean<ImageSearchRateLimitFilter> imageSearchRateLimitFilterRegistration(
            ImageSearchRateLimitFilter filter) {
        FilterRegistrationBean<ImageSearchRateLimitFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        List<String> allowedOriginPatterns = cleanList(securityProperties.getCorsAllowedOriginPatterns());
        if (allowedOriginPatterns.isEmpty()) {
            configuration.setAllowedOrigins(cleanList(securityProperties.getCorsAllowedOrigins()));
        } else {
            configuration.setAllowedOriginPatterns(allowedOriginPatterns);
        }
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        configuration.setAllowedHeaders(Arrays.asList(
                "Authorization",
                "Content-Type",
                "Accept",
                "Origin",
                "X-Requested-With"));
        configuration.setExposedHeaders(List.of("Authorization"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    private void writeErrorResponse(
            HttpServletResponse response,
            HttpStatus status,
            String path,
            String message) throws java.io.IOException {
        response.setStatus(status.value());
        response.setContentType("application/json;charset=UTF-8");
        ApiErrorResponse body = ApiErrorResponse.of(status, message, path);
        objectMapper.writeValue(response.getWriter(), body);
    }

    private List<String> cleanList(Collection<String> values) {
        if (values == null) {
            return List.of();
        }
        return values.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .toList();
    }
}
