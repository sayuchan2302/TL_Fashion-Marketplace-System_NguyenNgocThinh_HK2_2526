package vn.edu.hcmuaf.fit.marketplace.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(
        name = "public_code_counters",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_public_code_counter_type_date",
                columnNames = {"code_type", "code_date"}
        )
)
public class PublicCodeCounter {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "code_type", nullable = false, length = 32)
    private PublicCodeType codeType;

    @Column(name = "code_date", nullable = false)
    private LocalDate codeDate;

    @Column(name = "last_value", nullable = false)
    private Long lastValue;

    public PublicCodeCounter() {
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public PublicCodeType getCodeType() {
        return codeType;
    }

    public void setCodeType(PublicCodeType codeType) {
        this.codeType = codeType;
    }

    public LocalDate getCodeDate() {
        return codeDate;
    }

    public void setCodeDate(LocalDate codeDate) {
        this.codeDate = codeDate;
    }

    public Long getLastValue() {
        return lastValue;
    }

    public void setLastValue(Long lastValue) {
        this.lastValue = lastValue;
    }
}
