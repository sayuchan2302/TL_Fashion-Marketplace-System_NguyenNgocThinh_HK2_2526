package vn.edu.hcmuaf.fit.marketplace.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import vn.edu.hcmuaf.fit.marketplace.config.VisionSearchProperties;
import vn.edu.hcmuaf.fit.marketplace.dto.response.AdminVisionOverviewResponse;
import vn.edu.hcmuaf.fit.marketplace.entity.VisionSyncFailure;
import vn.edu.hcmuaf.fit.marketplace.entity.VisionSyncRun;
import vn.edu.hcmuaf.fit.marketplace.repository.VisionSyncFailureRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.VisionSyncRunRepository;

import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

@Service
public class AdminVisionService {

    private static final Logger logger = LoggerFactory.getLogger(AdminVisionService.class);

    private final VisionAdminClient visionAdminClient;
    private final VisionSearchProperties visionSearchProperties;
    private final VisionSyncRunRepository syncRunRepository;
    private final VisionSyncFailureRepository syncFailureRepository;

    public AdminVisionService(VisionAdminClient visionAdminClient,
            VisionSearchProperties visionSearchProperties,
            VisionSyncRunRepository syncRunRepository,
            VisionSyncFailureRepository syncFailureRepository) {
        this.visionAdminClient = visionAdminClient;
        this.visionSearchProperties = visionSearchProperties;
        this.syncRunRepository = syncRunRepository;
        this.syncFailureRepository = syncFailureRepository;
    }

    @Transactional
    public AdminVisionOverviewResponse getOverview() {
        Optional<VisionAdminClient.HealthPayload> health = safeCall(
                "vision health", visionAdminClient::getHealth);
        Optional<VisionAdminClient.ReadyPayload> ready = safeCall(
                "vision readiness", visionAdminClient::getReady);
        Optional<VisionAdminClient.IndexInfoPayload> index = safeCall(
                "vision index info", visionAdminClient::getIndexInfo);
        Optional<VisionAdminClient.MetricsPayload> metrics = safeCall(
                "vision metrics", visionAdminClient::getMetrics);

        VisionSyncRun latestRun = syncRunRepository.findFirstByOrderByStartedAtDesc()
                .map(this::reconcileRunningRun)
                .orElse(null);
        AdminVisionOverviewResponse.SyncSummary syncSummary = latestRun == null
                ? idleSyncSummary()
                : buildSyncSummary(latestRun);
        List<AdminVisionOverviewResponse.SyncFailure> failures = latestRun == null
                ? List.of()
                : syncFailureRepository.findTop100ByRunOrderByCreatedAtAsc(latestRun)
                        .stream()
                        .map(this::toFailureResponse)
                        .toList();

        return AdminVisionOverviewResponse.builder()
                .healthItems(List.of(
                        buildEngineHealth(health, ready),
                        buildVectorDbHealth(ready),
                        buildBackendConfigHealth(),
                        buildCatalogHealth(syncSummary, failures)))
                .indexSummary(buildIndexSummary(index, syncSummary))
                .searchMetrics(buildSearchMetrics(metrics))
                .syncSummary(syncSummary)
                .failures(failures)
                .build();
    }

    @Transactional
    public AdminVisionOverviewResponse syncCatalog() {
        ensureSyncAllowed();
        syncRunRepository.findFirstByStatusOrderByStartedAtDesc(VisionSyncRun.Status.RUNNING)
                .map(this::reconcileRunningRun)
                .filter(run -> run.getStatus() == VisionSyncRun.Status.RUNNING)
                .ifPresent(run -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Catalog sync is already running");
                });

        VisionAdminClient.SyncCatalogJobStartPayload payload = visionAdminClient
                .startSyncCatalogJob();
        VisionSyncRun run = VisionSyncRun.builder()
                .jobId(emptyToDefault(payload.jobId(), "manual-" + Instant.now().toEpochMilli()))
                .status(VisionSyncRun.Status.RUNNING)
                .startedAt(parseInstant(payload.startedAt(), Instant.now()))
                .message("Đang đồng bộ catalog")
                .build();
        syncRunRepository.save(run);
        return getOverview();
    }

    private VisionSyncRun reconcileRunningRun(VisionSyncRun run) {
        if (run == null || run.getStatus() != VisionSyncRun.Status.RUNNING) {
            return run;
        }
        if (run.getJobId() == null || run.getJobId().isBlank()) {
            return run;
        }

        VisionAdminClient.SyncCatalogJobPayload payload;
        try {
            payload = visionAdminClient.getSyncCatalogJob(run.getJobId());
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode().value() == HttpStatus.NOT_FOUND.value()) {
                run.setStatus(VisionSyncRun.Status.ERROR);
                run.setFinishedAt(Instant.now());
                run.setDurationMs(resolveDurationMs(run));
                run.setError("Vision sync job no longer exists");
                run.setMessage(run.getError());
                return syncRunRepository.save(run);
            }
            logger.warn("vision sync job status unavailable: {}", ex.getReason());
            return run;
        }
        if (payload == null) {
            return run;
        }
        String status = emptyToDefault(payload.status(), "running").toLowerCase();
        if ("success".equals(status) || "completed".equals(status)) {
            applyRunSuccess(run, payload);
            return syncRunRepository.save(run);
        }
        if ("error".equals(status) || "failed".equals(status)) {
            applyRunError(run, payload);
            return syncRunRepository.save(run);
        }
        return run;
    }

    private void applyRunSuccess(VisionSyncRun run,
            VisionAdminClient.SyncCatalogJobPayload job) {
        VisionAdminClient.SyncCatalogPayload result = job.result();
        if (result != null) {
            run.setImagesProcessed(nullToZero(result.imagesProcessed()));
            run.setEmbeddingsInserted(nullToZero(result.embeddingsInserted()));
            run.setEmbeddingsUpdated(nullToZero(result.embeddingsUpdated()));
            run.setSkippedUnchanged(nullToZero(result.skippedUnchanged()));
            run.setFailedImages(nullToZero(result.failedImages()));
            run.setDeactivatedRows(nullToZero(result.deactivatedRows()));
            run.setSyncToken(result.syncToken());
            run.setIndexVersion(result.indexVersion());
            replaceFailures(run, result.failures());
        }
        run.setStatus(VisionSyncRun.Status.SUCCESS);
        run.setFinishedAt(parseInstant(job.finishedAt(), Instant.now()));
        run.setDurationMs(resolveDurationMs(run));
        run.setMessage("Đồng bộ catalog hoàn tất");
        run.setError(null);
    }

    private void applyRunError(VisionSyncRun run,
            VisionAdminClient.SyncCatalogJobPayload job) {
        run.setStatus(VisionSyncRun.Status.ERROR);
        run.setFinishedAt(parseInstant(job.finishedAt(), Instant.now()));
        run.setDurationMs(resolveDurationMs(run));
        run.setError(emptyToDefault(job.error(), "Vision engine sync job failed"));
        run.setMessage(run.getError());
    }

    private void replaceFailures(VisionSyncRun run, List<Map<String, Object>> failures) {
        List<VisionSyncFailure> nextFailures = new ArrayList<>();
        if (failures != null) {
            failures.stream()
                    .limit(100)
                    .map(failure -> toFailureEntity(run, failure))
                    .forEach(nextFailures::add);
        }
        run.getFailures().clear();
        run.getFailures().addAll(nextFailures);
    }

    private VisionSyncFailure toFailureEntity(VisionSyncRun run,
            Map<String, Object> failure) {
        String reason = valueAsString(failure.get("reason"));
        return VisionSyncFailure.builder()
                .run(run)
                .productId(valueAsString(failure.get("backend_product_id")))
                .imageUrl(valueAsString(failure.get("image_url")))
                .reason(reason)
                .note(emptyToDefault(valueAsString(failure.get("error")),
                        "Không có mô tả lỗi"))
                .status(failureStatus(reason))
                .build();
    }

    private void ensureSyncAllowed() {
        if (!visionSearchProperties.isEnabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Image search service is disabled");
        }
        if (visionSearchProperties.getBaseUrl() == null
                || visionSearchProperties.getBaseUrl().isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Image search service is not configured");
        }
        if (visionSearchProperties.getInternalSecret() == null
                || visionSearchProperties.getInternalSecret().isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Image search secret is not configured");
        }
    }

    private <T> Optional<T> safeCall(String label, Supplier<T> supplier) {
        try {
            return Optional.ofNullable(supplier.get());
        } catch (ResponseStatusException ex) {
            logger.warn("{} unavailable: {}", label, ex.getReason());
            return Optional.empty();
        }
    }

    private AdminVisionOverviewResponse.HealthItem buildEngineHealth(
            Optional<VisionAdminClient.HealthPayload> health,
            Optional<VisionAdminClient.ReadyPayload> ready) {
        if (health.isEmpty()) {
            return healthItem("engine", "Vision Engine", "Down",
                    "Không gọi được vision-engine tại " + safeBaseUrl(),
                    "down");
        }
        if (!Boolean.TRUE.equals(ready.map(VisionAdminClient.ReadyPayload::ready)
                .orElse(false))) {
            return healthItem("engine", "Vision Engine", "Not ready",
                    "Service phản hồi nhưng model hoặc database chưa sẵn sàng",
                    "warning");
        }
        return healthItem("engine", "Vision Engine", "Ready",
                "Service " + safeBaseUrl() + " sẵn sàng nhận search",
                "ready");
    }

    private AdminVisionOverviewResponse.HealthItem buildVectorDbHealth(
            Optional<VisionAdminClient.ReadyPayload> ready) {
        if (ready.isEmpty()) {
            return healthItem("database", "Vector DB", "Unknown",
                    "Không kiểm tra được kết nối pgvector từ vision-engine",
                    "down");
        }
        if (!Boolean.TRUE.equals(ready.get().ready())) {
            return healthItem("database", "Vector DB", "Not ready",
                    "Vision readiness chưa xác nhận được database/model",
                    "warning");
        }
        return healthItem("database", "Vector DB", "Connected",
                "pgvector schema vision.product_image_embeddings", "ready");
    }

    private AdminVisionOverviewResponse.HealthItem buildBackendConfigHealth() {
        if (!visionSearchProperties.isEnabled()) {
            return healthItem("backend", "Backend Vision", "Disabled",
                    "APP_VISION_ENABLED đang tắt", "down");
        }
        if (visionSearchProperties.getBaseUrl() == null
                || visionSearchProperties.getBaseUrl().isBlank()) {
            return healthItem("backend", "Backend Vision", "Missing base URL",
                    "APP_VISION_BASE_URL chưa được cấu hình", "down");
        }
        if (visionSearchProperties.getInternalSecret() == null
                || visionSearchProperties.getInternalSecret().isBlank()) {
            return healthItem("backend", "Backend Vision", "Missing secret",
                    "APP_VISION_INTERNAL_SECRET chưa được cấu hình",
                    "warning");
        }
        return healthItem("backend", "Backend Vision", "Enabled",
                "Public image search đang bật qua marketplace API", "ready");
    }

    private AdminVisionOverviewResponse.HealthItem buildCatalogHealth(
            AdminVisionOverviewResponse.SyncSummary syncSummary,
            List<AdminVisionOverviewResponse.SyncFailure> failures) {
        if ("syncing".equals(syncSummary.getStatus())) {
            return healthItem("catalog", "Catalog Guard", "Syncing",
                    "Đang đồng bộ ảnh sản phẩm sang vector index", "warning");
        }
        if ("error".equals(syncSummary.getStatus())) {
            return healthItem("catalog", "Catalog Guard", "Sync error",
                    emptyToDefault(syncSummary.getMessage(),
                            "Lần đồng bộ gần nhất bị lỗi"),
                    "down");
        }
        if (!failures.isEmpty()) {
            return healthItem("catalog", "Catalog Guard",
                    failures.size() + " cảnh báo",
                    "Một số ảnh bị bỏ qua hoặc lỗi khi sync catalog",
                    "warning");
        }
        return healthItem("catalog", "Catalog Guard", "Clean",
                "Chưa ghi nhận lỗi sync catalog gần đây",
                "ready");
    }

    private AdminVisionOverviewResponse.IndexSummary buildIndexSummary(
            Optional<VisionAdminClient.IndexInfoPayload> payload,
            AdminVisionOverviewResponse.SyncSummary syncSummary) {
        VisionAdminClient.IndexInfoPayload index = payload.orElse(null);
        String indexVersion = index == null ? "empty" : emptyToDefault(index.indexVersion(), "empty");
        return AdminVisionOverviewResponse.IndexSummary.builder()
                .modelName(index == null ? "unknown" : emptyToDefault(index.modelName(), "unknown"))
                .modelPretrained(index == null ? "unknown" : emptyToDefault(index.modelPretrained(), "unknown"))
                .embeddingDimension(
                        index == null || index.embeddingDimension() == null ? 0 : index.embeddingDimension())
                .activeImageCount(index == null ? 0L : nullToZero(index.activeImageCount()))
                .activeProductCount(index == null ? 0L : nullToZero(index.activeProductCount()))
                .indexVersion(indexVersion)
                .lastUpdatedAt(resolveLastUpdatedAt(syncSummary, indexVersion))
                .build();
    }

    private AdminVisionOverviewResponse.SearchMetrics buildSearchMetrics(
            Optional<VisionAdminClient.MetricsPayload> payload) {
        VisionAdminClient.MetricsPayload metrics = payload.orElse(null);
        if (metrics == null) {
            return AdminVisionOverviewResponse.SearchMetrics.builder()
                    .totalRequests(0L)
                    .acceptedRequests(0L)
                    .emptyRequests(0L)
                    .lowConfidenceRequests(0L)
                    .invalidImageRequests(0L)
                    .searchLatencyP95Ms(0.0)
                    .averageTopScore(0.0)
                    .lastSearchAt(null)
                    .build();
        }

        long invalidImageRequests = nullToZero(metrics.invalidContentTypeRequests())
                + nullToZero(metrics.emptyPayloadRequests())
                + nullToZero(metrics.oversizedPayloadRequests())
                + nullToZero(metrics.decodeErrorRequests());
        return AdminVisionOverviewResponse.SearchMetrics.builder()
                .totalRequests(nullToZero(metrics.totalRequests()))
                .acceptedRequests(nullToZero(metrics.acceptedRequests()))
                .emptyRequests(nullToZero(metrics.emptyRequests()))
                .lowConfidenceRequests(nullToZero(metrics.lowConfidenceRequests()))
                .invalidImageRequests(invalidImageRequests)
                .searchLatencyP95Ms(nullToZero(metrics.searchLatencyP95Ms()))
                .averageTopScore(metrics.averageTopScore() == null ? 0.0 : metrics.averageTopScore())
                .lastSearchAt(metrics.lastSearchAt())
                .build();
    }

    private AdminVisionOverviewResponse.SyncSummary buildSyncSummary(VisionSyncRun run) {
        return AdminVisionOverviewResponse.SyncSummary.builder()
                .status(toApiStatus(run.getStatus()))
                .jobId(run.getJobId())
                .lastSyncedAt(run.getStatus() == VisionSyncRun.Status.SUCCESS
                        ? emptyToDefault(run.getSyncToken(), formatInstant(run.getFinishedAt()))
                        : formatInstant(run.getFinishedAt()))
                .startedAt(formatInstant(run.getStartedAt()))
                .finishedAt(formatInstant(run.getFinishedAt()))
                .durationMs(run.getDurationMs())
                .imagesProcessed(nullToZero(run.getImagesProcessed()))
                .embeddingsInserted(nullToZero(run.getEmbeddingsInserted()))
                .embeddingsUpdated(nullToZero(run.getEmbeddingsUpdated()))
                .skippedUnchanged(nullToZero(run.getSkippedUnchanged()))
                .failedImages(nullToZero(run.getFailedImages()))
                .deactivatedRows(nullToZero(run.getDeactivatedRows()))
                .message(run.getMessage())
                .build();
    }

    private static AdminVisionOverviewResponse.SyncSummary idleSyncSummary() {
        return AdminVisionOverviewResponse.SyncSummary.builder()
                .status("idle")
                .lastSyncedAt(null)
                .imagesProcessed(0L)
                .embeddingsInserted(0L)
                .embeddingsUpdated(0L)
                .skippedUnchanged(0L)
                .failedImages(0L)
                .deactivatedRows(0L)
                .message("Chưa chạy sync catalog")
                .build();
    }

    private AdminVisionOverviewResponse.SyncFailure toFailureResponse(
            VisionSyncFailure failure) {
        return AdminVisionOverviewResponse.SyncFailure.builder()
                .productId(failure.getProductId())
                .imageUrl(failure.getImageUrl())
                .reason(failure.getReason())
                .note(failure.getNote())
                .status(failure.getStatus())
                .build();
    }

    private String failureStatus(String reason) {
        if ("disallowed_image_url".equals(reason)) {
            return "blocked";
        }
        if ("download_too_large".equals(reason)
                || "decoded_pixels_too_large".equals(reason)) {
            return "warning";
        }
        return "error";
    }

    private AdminVisionOverviewResponse.HealthItem healthItem(String id,
            String label, String value, String detail, String status) {
        return AdminVisionOverviewResponse.HealthItem.builder()
                .id(id)
                .label(label)
                .value(value)
                .detail(detail)
                .status(status)
                .build();
    }

    private String resolveLastUpdatedAt(
            AdminVisionOverviewResponse.SyncSummary syncSummary,
            String indexVersion) {
        if ("success".equals(syncSummary.getStatus())
                && syncSummary.getLastSyncedAt() != null
                && !syncSummary.getLastSyncedAt().isBlank()) {
            return syncSummary.getLastSyncedAt();
        }
        return "empty".equals(indexVersion) ? null : indexVersion;
    }

    private String toApiStatus(VisionSyncRun.Status status) {
        if (status == VisionSyncRun.Status.SUCCESS) {
            return "success";
        }
        if (status == VisionSyncRun.Status.ERROR) {
            return "error";
        }
        return "syncing";
    }

    private Long resolveDurationMs(VisionSyncRun run) {
        if (run.getStartedAt() == null || run.getFinishedAt() == null) {
            return null;
        }
        return Math.max(0L, Duration.between(run.getStartedAt(), run.getFinishedAt()).toMillis());
    }

    private Instant parseInstant(String value, Instant fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException ignored) {
            return fallback;
        }
    }

    private String formatInstant(Instant value) {
        return value == null ? null : value.toString();
    }

    private String safeBaseUrl() {
        return emptyToDefault(visionSearchProperties.getBaseUrl(), "chưa cấu hình");
    }

    private String valueAsString(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String emptyToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private long nullToZero(Long value) {
        return value == null ? 0L : value;
    }

    private double nullToZero(Double value) {
        return value == null ? 0.0 : value;
    }
}
