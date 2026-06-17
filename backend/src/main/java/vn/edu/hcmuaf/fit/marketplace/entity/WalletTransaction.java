package vn.edu.hcmuaf.fit.marketplace.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;
import org.hibernate.annotations.Check;

import java.math.BigDecimal;
import java.util.UUID;

@Getter
@Setter
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Check(constraints = "type IN ('CREDIT', 'DEBIT', 'WITHDRAWAL', 'ESCROW_CREDIT', 'ESCROW_RELEASE', 'PAYOUT_DEBIT', 'REFUND_DEBIT', 'RETURN_REFUND_DEBIT', 'COMMISSION_REFUND')")
@Table(
        name = "wallet_transactions",
        indexes = {
                @Index(name = "idx_wallet_transactions_transaction_code", columnList = "transaction_code", unique = true)
        },
        uniqueConstraints = {
                @UniqueConstraint(name = "uq_wallet_tx_return_type", columnNames = {"return_request_id", "type"})
        }
)
public class WalletTransaction extends BaseEntity {

    @Column(name = "transaction_code", length = 32, unique = true)
    private String transactionCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "wallet_id", nullable = false)
    private VendorWallet wallet;

    @Column(name = "order_id")
    private UUID orderId;

    @Column(name = "return_request_id")
    private UUID returnRequestId;

    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 20)
    private TransactionType type;

    @Column(name = "description")
    private String description;

    public enum TransactionType {
        CREDIT, DEBIT, WITHDRAWAL, ESCROW_CREDIT, ESCROW_RELEASE, PAYOUT_DEBIT, REFUND_DEBIT, RETURN_REFUND_DEBIT, COMMISSION_REFUND
    }
}
